(() => {
	const CONFIG = {
		players: [
			{
				id: "player1",
				platform: "youtube",
				videoId: "9pvRbezK8Ko",
				start: 41,
				quality: "hd720"
			},
			{
				id: "player2",
				platform: "youtube",
				videoId: "_IWYetw6X1Q",
				start: 11,
				quality: "hd1080"
			},
			{
				id: "player3",
				platform: "youtube",
				videoId: "3H0DvdlLVEU",
				start: 129,
				quality: "hd1080"
			},
			{
				id: "player4",
				platform: "youtube",
				videoId: "X0KH7VcogFE",
				start: 95,
				quality: "hd1080"
			},
			{
				id: "player5",
				platform: "youtube",
				videoId: "aMVdJk2GGNw",
				start: 5,
				quality: "hd720"
			},
			{
				id: "player6",
				platform: "twitch",
				videoId: "2609194736",
				start: 0,
				quality: "chunked"
			}
		],
		seekStep: 10,
		uiTickMs: 120,
		resyncEveryMs: 500,
		resyncThresholdSeconds: 0.4
	};

	const state = {
		players: [],
		readyCount: 0,
		uiInterval: null,
		resyncInterval: null,
		isScrubbing: false,
		firstMuted: false
	};

	const els = {
		togglePlay: document.getElementById("togglePlay"),
		togglePlayIcon: document.getElementById("togglePlayIcon"),
		restartBoth: document.getElementById("restartBoth"),
		rewindBoth: document.getElementById("rewindBoth"),
		forwardBoth: document.getElementById("forwardBoth"),
		stopBoth: document.getElementById("stopBoth"),
		toggleMuteFirst: document.getElementById("toggleMuteFirst"),
		muteFirstIcon: document.getElementById("muteFirstIcon"),
		timeline: document.getElementById("timeline"),
		currentTime: document.getElementById("currentTime"),
		duration: document.getElementById("duration"),
		statusText: document.getElementById("statusText")
	};

	function setStatus(text) {
		els.statusText.textContent = text;
	}

	function formatTime(seconds) {
		const total = Math.max(0, Math.floor(Number(seconds) || 0));
		const hours = Math.floor(total / 3600);
		const mins = Math.floor((total % 3600) / 60);
		const secs = total % 60;

		if (hours > 0) {
			return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(
				2,
				"0"
			)}`;
		}

		return `${mins}:${String(secs).padStart(2, "0")}`;
	}

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function getMaster() {
		return state.players[0] || null;
	}

	function getFirstPlayerObj() {
		return state.players[0] || null;
	}

	function isYouTube(playerObj) {
		return playerObj?.platform === "youtube";
	}

	function isTwitch(playerObj) {
		return playerObj?.platform === "twitch";
	}

	function playOne(playerObj) {
		if (!playerObj?.instance) return;
		if (isYouTube(playerObj)) playerObj.instance.playVideo();
		else playerObj.instance.play();
	}

	function pauseOne(playerObj) {
		if (!playerObj?.instance) return;
		if (isYouTube(playerObj)) playerObj.instance.pauseVideo();
		else playerObj.instance.pause();
	}

	function stopOne(playerObj) {
		if (!playerObj?.instance) return;

		if (isYouTube(playerObj)) {
			playerObj.instance.stopVideo();
		} else {
			playerObj.instance.pause();
			playerObj.instance.seek(playerObj.start || 0);
		}
	}

	function seekOne(playerObj, absoluteTime, allowPlayState = true) {
		if (!playerObj?.instance) return;

		if (isYouTube(playerObj)) {
			playerObj.instance.seekTo(absoluteTime, true);
			return;
		}

		playerObj.instance.seek(absoluteTime);

		if (!allowPlayState) {
			playerObj.instance.pause();
		}
	}

	function getCurrentOne(playerObj) {
		if (!playerObj?.instance?.getCurrentTime) return 0;
		return playerObj.instance.getCurrentTime();
	}

	function getDurationOne(playerObj) {
		if (!playerObj?.instance?.getDuration) return 0;
		return playerObj.instance.getDuration();
	}

	function setMutedOne(playerObj, muted) {
		if (!playerObj?.instance) return;

		if (isYouTube(playerObj)) {
			if (muted) playerObj.instance.mute();
			else playerObj.instance.unMute();
			return;
		}

		playerObj.instance.setMuted(muted);
	}

	function getMutedOne(playerObj) {
		if (!playerObj?.instance) return false;

		if (isYouTube(playerObj)) {
			return playerObj.instance.isMuted ? playerObj.instance.isMuted() : false;
		}

		return playerObj.instance.getMuted ? playerObj.instance.getMuted() : false;
	}

	function getPlayingOne(playerObj) {
		if (!playerObj?.instance) return false;

		if (isYouTube(playerObj)) {
			try {
				return playerObj.instance.getPlayerState() === YT.PlayerState.PLAYING;
			} catch {
				return false;
			}
		}

		try {
			return !playerObj.instance.isPaused();
		} catch {
			return false;
		}
	}

	function isAnyPlaying() {
		return state.players.some((playerObj) => getPlayingOne(playerObj));
	}

	function updatePlayButton() {
		const playing = isAnyPlaying();
		els.togglePlayIcon.textContent = playing ? "pause" : "play_arrow";
		els.togglePlay.setAttribute(
			"aria-label",
			playing ? "Pause all videos" : "Play all videos"
		);
	}

	function updateMuteButton() {
		els.muteFirstIcon.textContent = state.firstMuted ? "volume_off" : "volume_up";
		els.toggleMuteFirst.classList.toggle("btn--active", !state.firstMuted);
		els.toggleMuteFirst.setAttribute(
			"aria-label",
			state.firstMuted ? "Unmute first video" : "Mute first video"
		);
	}

	function getRelativeCurrent(playerObj) {
		return Math.max(0, getCurrentOne(playerObj) - playerObj.start);
	}

	function getRelativeDuration(playerObj) {
		return Math.max(0, getDurationOne(playerObj) - playerObj.start);
	}

	function syncTimelineVisual(value, max) {
		const safeMax = Math.max(0.0001, Number(max) || 100);
		const pct = `${(Number(value) / safeMax) * 100}%`;
		els.timeline.style.setProperty("--progress", pct);
	}

	function updateTimeline() {
		const master = getMaster();
		if (!master || !master.instance) return;

		const current = getRelativeCurrent(master);
		const duration = getRelativeDuration(master);

		if (!state.isScrubbing) {
			els.timeline.max = duration || 100;
			els.timeline.value = clamp(current, 0, duration || 100);
			syncTimelineVisual(els.timeline.value, els.timeline.max);
			els.currentTime.textContent = formatTime(current);
		}

		els.duration.textContent = formatTime(duration);
		updatePlayButton();
	}

	function runBoth(callback) {
		state.players.forEach((playerObj) => {
			if (playerObj.instance) callback(playerObj);
		});
	}

	function playBoth() {
		runBoth((playerObj) => playOne(playerObj));
		setStatus("Playing all");
		updatePlayButton();
	}

	function pauseBoth() {
		runBoth((playerObj) => pauseOne(playerObj));
		setStatus("Paused");
		updatePlayButton();
	}

	function stopBoth() {
		runBoth((playerObj) => stopOne(playerObj));
		setStatus("Stopped");
		updatePlayButton();
	}

	function restartBoth() {
		runBoth((playerObj) => {
			seekOne(playerObj, playerObj.start, false);
			playOne(playerObj);
		});
		setStatus("Restarted");
		updatePlayButton();
	}

	function offsetBoth(seconds) {
		runBoth((playerObj) => {
			const current = getCurrentOne(playerObj);
			seekOne(playerObj, Math.max(0, current + seconds));
		});
		setStatus(
			seconds > 0 ? `Forward ${seconds}s` : `Rewind ${Math.abs(seconds)}s`
		);
	}

	function seekRelativeTo(relativeTime, shouldPlayAfter = false) {
		runBoth((playerObj) => {
			seekOne(playerObj, playerObj.start + relativeTime, shouldPlayAfter);
			if (shouldPlayAfter) playOne(playerObj);
		});

		els.currentTime.textContent = formatTime(relativeTime);
		syncTimelineVisual(relativeTime, els.timeline.max);
		setStatus(`Seek to ${formatTime(relativeTime)}`);
	}

	function toggleMuteFirst() {
		const firstObj = getFirstPlayerObj();
		if (!firstObj) return;

		state.firstMuted = !state.firstMuted;
		setMutedOne(firstObj, state.firstMuted);
		updateMuteButton();
		setStatus(state.firstMuted ? "First video muted" : "First video unmuted");
	}

	function resyncPlayers() {
		if (state.isScrubbing || !isAnyPlaying() || state.players.length < 2) return;

		const master = getMaster();
		if (!master?.instance) return;

		const masterTime = getCurrentOne(master);

		state.players.slice(1).forEach((playerObj) => {
			const current = getCurrentOne(playerObj);
			const diff = Math.abs(current - masterTime);

			if (diff > CONFIG.resyncThresholdSeconds) {
				seekOne(playerObj, masterTime);
			}
		});
	}

	function markReady() {
		state.readyCount += 1;

		if (state.readyCount === CONFIG.players.length) {
			updateTimeline();

			if (!state.uiInterval) {
				state.uiInterval = setInterval(updateTimeline, CONFIG.uiTickMs);
			}

			if (!state.resyncInterval) {
				state.resyncInterval = setInterval(resyncPlayers, CONFIG.resyncEveryMs);
			}

			setStatus("Loaded");
		}
	}

	function onYouTubeReady(event) {
		const playerObj = state.players.find((p) => p.instance === event.target);
		if (!playerObj) return;

		playerObj.ready = true;

		try {
			event.target.setPlaybackQuality(playerObj.quality);
		} catch {}

		if (playerObj.id === "player1") {
			state.firstMuted = getMutedOne(playerObj);

			if (state.firstMuted) {
				try {
					event.target.unMute();
					state.firstMuted = false;
				} catch {}
			}
		} else {
			event.target.mute();
		}

		updateMuteButton();
		markReady();
	}

	function onYouTubeStateChange() {
		updatePlayButton();
	}

	function onYouTubeError(event, label) {
		setStatus(`${label} error: ${event.data}`);
		console.error(`${label} error`, event.data);
	}

	function attachTwitchEvents(playerObj) {
		const player = playerObj.instance;

		player.addEventListener(Twitch.Player.READY, () => {
			playerObj.ready = true;

			try {
				player.setQuality(playerObj.quality || "chunked");
			} catch {}

			if (playerObj.id === "player1") {
				state.firstMuted = getMutedOne(playerObj);
			} else {
				player.setMuted(true);
			}

			updateMuteButton();
			markReady();
		});

		player.addEventListener(Twitch.Player.PLAY, updatePlayButton);
		player.addEventListener(Twitch.Player.PLAYING, updatePlayButton);
		player.addEventListener(Twitch.Player.PAUSE, updatePlayButton);
		player.addEventListener(Twitch.Player.ENDED, updatePlayButton);

		player.addEventListener(Twitch.Player.PLAYBACK_BLOCKED, () => {
			setStatus("Twitch playback blocked");
		});
	}

	window.onYouTubeIframeAPIReady = function () {
		const origin = window.location.origin;
		const parentHost = window.location.hostname;

		state.players = CONFIG.players.map((cfg, index) => {
			let instance;

			if (cfg.platform === "twitch") {
				instance = new Twitch.Player(cfg.id, {
					width: "100%",
					height: "100%",
					video: cfg.videoId.startsWith("v") ? cfg.videoId : `v${cfg.videoId}`,
					parent: [parentHost],
					autoplay: false,
					muted: true
				});

				const playerObj = {
					...cfg,
					instance,
					ready: false
				};

				attachTwitchEvents(playerObj);
				return playerObj;
			}

			instance = new YT.Player(cfg.id, {
				width: "100%",
				height: "100%",
				videoId: cfg.videoId,
				playerVars: {
					autoplay: 0,
					controls: 0,
					rel: 0,
					playsinline: 1,
					enablejsapi: 1,
					origin,
					start: cfg.start
				},
				events: {
					onReady: onYouTubeReady,
					onStateChange: onYouTubeStateChange,
					onError: (e) => onYouTubeError(e, `Player ${index + 1}`)
				}
			});

			return {
				...cfg,
				instance,
				ready: false
			};
		});

		setStatus("Initializing players…");
	};

	els.togglePlay.addEventListener("click", () => {
		if (isAnyPlaying()) {
			pauseBoth();
		} else {
			playBoth();
		}
	});

	els.stopBoth.addEventListener("click", stopBoth);
	els.restartBoth.addEventListener("click", restartBoth);
	els.rewindBoth.addEventListener("click", () => offsetBoth(-CONFIG.seekStep));
	els.forwardBoth.addEventListener("click", () => offsetBoth(CONFIG.seekStep));
	els.toggleMuteFirst.addEventListener("click", toggleMuteFirst);

	els.timeline.addEventListener("input", () => {
		state.isScrubbing = true;
		syncTimelineVisual(els.timeline.value, els.timeline.max);
		els.currentTime.textContent = formatTime(els.timeline.value);
	});

	els.timeline.addEventListener("change", () => {
		const target = Number(els.timeline.value) || 0;
		const keepPlaying = isAnyPlaying();
		seekRelativeTo(target, keepPlaying);
		state.isScrubbing = false;
	});

	els.timeline.addEventListener("pointerdown", () => {
		state.isScrubbing = true;
	});

	els.timeline.addEventListener("pointerup", () => {
		state.isScrubbing = false;
	});

	document.addEventListener("keydown", (event) => {
		const tag = document.activeElement?.tagName;
		const typing =
			tag === "INPUT" ||
			tag === "TEXTAREA" ||
			document.activeElement?.isContentEditable;

		if (typing && document.activeElement !== els.timeline) return;

		switch (event.key) {
			case " ":
			case "k":
			case "K":
				event.preventDefault();
				els.togglePlay.click();
				break;
			case "ArrowLeft":
				event.preventDefault();
				offsetBoth(-CONFIG.seekStep);
				break;
			case "ArrowRight":
				event.preventDefault();
				offsetBoth(CONFIG.seekStep);
				break;
			case "r":
			case "R":
				event.preventDefault();
				restartBoth();
				break;
			case "s":
			case "S":
				event.preventDefault();
				stopBoth();
				break;
			case "m":
			case "M":
				event.preventDefault();
				toggleMuteFirst();
				break;
		}
	});

	window.addEventListener("beforeunload", () => {
		if (state.uiInterval) clearInterval(state.uiInterval);
		if (state.resyncInterval) clearInterval(state.resyncInterval);

		runBoth(({ instance, platform }) => {
			try {
				if (platform === "youtube" && instance.destroy) instance.destroy();
			} catch {}
		});
	});
})();
