// create Agora client
var client = AgoraRTC.createClient({
  mode: "rtc",
  codec: "vp8",
});
AgoraRTC.enableLogUpload();
var localTracks = {
  videoTrack: null,
  audioTrack: null,
};
var remoteUsers = {};
// Agora client options

var options = {
  subscribeOnly: true,
  appid: "",
  channel: "",
  uid: "",
  token: "",
  cameraLabel: "OBS",
};

const streamQualityConfig = {
  low: {
    width: 640,
    height: 360,
    framerate: 24,
    bitrate: 960,
  },
  high: {
    width: { min: 1270, max: 1920 },
    height: { min: 720, max: 1080 },
    frameRate: { min: 23, max: 30 },
    bitrateMin: 1620,
    bitrateMax: 3240,
  },
};

// the demo can auto join channel with params in url
$(() => {
  const urlParams = new URL(location.href).searchParams;
  const keys = ["subscribeOnly", "appid", "channel", "token", "uid"];

  keys.forEach((key) => {
    const value = urlParams.get(key);

    options[key] = decodeURIComponent(value);

    if (key === "subscribeOnly") {
      options[key] = options[key] === "true";
    }
  });

  if (options.appid && options.channel) {
    $("#uid").val(options.uid);
    $("#appid").val(options.appid);
    $("#token").val(options.token);
    $("#channel").val(options.channel);
    $("#join-form").submit();
  }
});

$("#join-form").submit(async function (e) {
  e.preventDefault();
  $("#join").attr("disabled", true);
  $("#auto-switch").attr("disabled", false);

  try {
    options.channel = $("#channel").val();
    options.uid = Number($("#uid").val());
    options.appid = $("#appid").val();
    options.token = $("#token").val();

    await join();
    if (options.token) {
      $("#success-alert-with-token").css("display", "block");
    } else {
      $("#success-alert a").attr(
        "href",
        `index.html?appid=${options.appid}&channel=${options.channel}&token=${options.token}`,
      );
      $("#success-alert").css("display", "block");
    }
  } catch (error) {
    console.error(error);
  } finally {
    $("#leave").attr("disabled", false);
  }
});

$("#leave").click(function (e) {
  leave();
});

async function join() {
  // add event listener to play remote tracks when remote user publishs.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  // Customize the video profile of the low-quality stream: 160 × 120, 15 fps, 120 Kbps.
  client.setLowStreamParameter(streamQualityConfig.low);

  // Enable dual-stream mode.
  await client.enableDualStream();

  options.uid = await client.join(
    options.appid,
    options.channel,
    options.token || null,
    options.uid || null,
  );

  // Set the stream type of the video streams that the client has subscribed to.
  await setSomeUserHQStream();

  if (options.subscribeOnly) {
    return;
  }

  [localTracks.audioTrack, localTracks.videoTrack] = await Promise.all([
    AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: "music_standard",
    }),
    AgoraRTC.createCameraVideoTrack({
      encoderConfig: streamQualityConfig.high,
    }),
  ]);

  await applyCamera(options.cameraLabel);

  // play local video track
  localTracks.videoTrack.play("local-player");
  $("#local-player-name").text(`localVideo(${options.uid})`);
  $("#joined-setup").css("display", "flex");

  // publish local tracks to channel
  await client.publish(Object.values(localTracks));
  console.log("publish success");
}

async function setSomeUserHQStream(HQStreamUserList = []) {
  // get a list of all remote users
  const allUserList = [...Object.keys(remoteUsers)].map(Number);
  // set default HQStreamUserList
  if (
    !HQStreamUserList ||
    (Array.isArray(HQStreamUserList) && HQStreamUserList.length === 0)
  ) {
    if (allUserList.length) {
      HQStreamUserList = [allUserList[0]];
    }
  }
  // All other elements are the elements of the LQStreamUserList
  const LQStreamUserList = allUserList.filter(
    (user) => !HQStreamUserList.includes(user),
  );
  const handlePromiseList = [];
  // Get a queue
  // The queue settings for all streams
  // On desktop browsers, a user can subscribe to up to four high-quality streams and 13 low-quality streams.
  // On mobile browsers, a user can subscribe to one high-quality stream and four low-quality streams

  LQStreamUserList.forEach(
    (user) =>
      void handlePromiseList.push(async () => {
        console.log(`set user: ${user} to LQ Stream`);
        const result = await client.setRemoteVideoStreamType(user, 1);
        return result;
      }),
  );
  HQStreamUserList.forEach(
    (user) =>
      void handlePromiseList.push(async () => {
        console.log(`set user: ${user} to HQ Stream`);
        const result = await client.setRemoteVideoStreamType(user, 0);
        return result;
      }),
  );
  // return a promise.all
  // promise.all requires an array of promises.
  return Promise.all(handlePromiseList.map((m) => m()));
}

async function leave() {
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if (track) {
      track.stop();
      track.close();
      localTracks[trackName] = undefined;
    }
  }

  // remove remote users and player views
  remoteUsers = {};
  $("#remote-playerlist").html("");

  // leave the channel
  await client.leave();
  $("#local-player-name").text("");
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  $("#auto-switch").attr("disabled", true);
  $("#joined-setup").css("display", "none");
  console.log("client leaves channel success");
}

async function subscribe(user, mediaType) {
  const uid = user.uid;
  // Set stream at each subscription
  await setSomeUserHQStream();
  // subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("subscribe success");
  if (mediaType === "video") {
    const player = $(`
      <div id="player-wrapper-${uid}">
        <p class="player-name">remoteUser(${uid})</p>
        <div id="player-${uid}" class="player" data-uid="${uid}"></div>
      </div>
    `);
    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
}

function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user, mediaType) {
  if (mediaType === "video") {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();
  }
}

$("#auto-switch").click((e) => {
  const isEnabled = e.target.getAttribute("data-enabled") === "true";

  if (isEnabled) {
    e.target.setAttribute("data-enabled", "false");
    e.target.textContent = "Start switching";

    return stopAutoSwitching();
  }

  e.target.setAttribute("data-enabled", "true");
  e.target.textContent = "Stop switching";

  hqUserId = Object.values(remoteUsers)[0].uid;

  startAutoSwitching().catch(() => {
    e.target.setAttribute("data-enabled", "false");
    e.target.textContent = "Start switching";

    console.debug("Settings remain the same. Stopped");
  });
});

let autoSwitchingEnabled = false;
let hqUserId = null;

async function startAutoSwitching() {
  autoSwitchingEnabled = true;

  while (autoSwitchingEnabled) {
    const user = Object.values(remoteUsers)[0];
    const uid = user.uid;

    const previousTrackSettings = user.videoTrack
      .getMediaStreamTrack()
      .getSettings();

    await switchStreamQuality(uid);

    const delay = getRandomArbitrary(500, 5_000);
    console.debug("delay before next switch:", delay);
    await sleep(delay);

    const areSettingsTheSame = () => {
      const currentTrackSettings = remoteUsers[uid].videoTrack
        .getMediaStreamTrack()
        .getSettings();

      console.debug(
        "currentTrackSettings",
        JSON.stringify(currentTrackSettings),
      );
      return (
        currentTrackSettings.height === previousTrackSettings.height ||
        currentTrackSettings.width === previousTrackSettings.width
      );
    };

    if (areSettingsTheSame()) {
      console.debug("DETECTED UNCHANGED STREAM QUALITY:", {
        uid,
        currentTrackSettings: remoteUsers[uid].videoTrack
          .getMediaStreamTrack()
          .getSettings(),
        previousTrackSettings,
      });

      console.debug("Wait 5 seconds and check track settings again");
      await sleep(5000);

      if (areSettingsTheSame()) {
        autoSwitchingEnabled = false;
        throw new Error("DETECTED UNCHANGED STREAM QUALITY");
      }
    }
  }
}

function stopAutoSwitching() {
  autoSwitchingEnabled = false;
}

async function sleep(delay = 3000) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function switchStreamQuality(uid) {
  if (hqUserId === uid) {
    await setSomeUserHQStream([NaN]);
    hqUserId = null;
    const player = document.getElementById(`player-${uid}`);
    player.parentElement.classList.remove("first-player");
    player.style.cssText = "border: unset;";
  } else {
    await setSomeUserHQStream([parseInt(uid)]);
    hqUserId = uid;
    const player = document.getElementById(`player-${uid}`);
    player.style.cssText = "border: 2px solid red;";
    player.parentElement.classList.add("first-player");
  }
}

async function listCameras() {
  const cams = await AgoraRTC.getCameras();
  console.debug("Cameras: ", cams);
}

async function switchCamera(deviceId) {
  localTracks.videoTrack.setDevice(deviceId);
}

async function applyCamera(label = "OBS") {
  const cams = await AgoraRTC.getCameras();
  const camera = cams.find((cam) => cam.label.includes("OBS"));

  if (!camera) {
    console.error(`No camera with label: ${label}`);
    return;
  }

  localTracks.videoTrack.setDevice(camera.deviceId);
}

function getRandomArbitrary(min, max) {
  return Math.ceil(Math.random() * (max - min) + min);
}
