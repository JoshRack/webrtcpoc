/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

var startButton = document.getElementById('startButton');
var callButton = document.getElementById('callButton');
var hangupButton = document.getElementById('hangupButton');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;

var startTime;
var localVideo = document.getElementById('localVideo');
var remoteVideo = document.getElementById('remoteVideo');

localVideo.addEventListener('loadedmetadata', function () {
    trace('Local video videoWidth: ' + this.videoWidth +
      'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.addEventListener('loadedmetadata', function () {
    trace('Remote video videoWidth: ' + this.videoWidth +
      'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.onresize = function () {
    trace('Remote video size changed to ' +
      remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
    // We'll use the first onsize callback as an indication that video has started
    // playing out.
    if (startTime) {
        var elapsedTime = window.performance.now() - startTime;
        trace('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
        startTime = null;
    }
};

var hub = $.connection.webRtcHub;
var localStream;
var pc1;
var pc2;
var offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
};

function getName(pc) {
    return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
    return (pc === pc1) ? pc2 : pc1;
}

function gotStream(stream) {
    trace('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;
    callButton.disabled = false;
}

function start() {
    //hub = $.connection.webRtcHub;
    $.connection.hub.start().done(function () { });

    trace('Requesting local stream');
    startButton.disabled = true;
    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
    })
    .then(gotStream)
    .catch(function (e) {
        alert('getUserMedia() error: ' + e.name);
    });
}

function call() {
    callButton.disabled = true;
    hangupButton.disabled = false;
    trace('Starting call');
    startTime = window.performance.now();
    var videoTracks = localStream.getVideoTracks();
    var audioTracks = localStream.getAudioTracks();
    if (videoTracks.length > 0) {
        trace('Using video device: ' + videoTracks[0].label);
    }
    if (audioTracks.length > 0) {
        trace('Using audio device: ' + audioTracks[0].label);
    }
    var servers = null;
    pc1 = new RTCPeerConnection(servers);
    trace('Created local peer connection object pc1');
    pc1.onicecandidate = function (e) {
        onIceCandidate(pc1, e);
    };
    pc1.oniceconnectionstatechange = function (e) {
        onIceStateChange(pc1, e);
    };    

    pc1.addStream(localStream);
    pc1.onaddstream = gotRemoteStream;
    trace('Added local stream to pc1');

    //change here?
    trace('pc1 createOffer start');
    pc1.createOffer(onCreateOfferSuccess, onCreateSessionDescriptionError,
        offerOptions);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}

function onCreateOfferSuccess(desc) {
    trace('Offer from pc1\n' + desc.sdp);
    trace('pc1 setLocalDescription start');
    pc1.setLocalDescription(desc, function () {
        hub.server.sendSdp(JSON.stringify({'sdp': desc}));
        onSetLocalSuccess(pc1);
    }, onSetSessionDescriptionError);
    //pc2.setRemoteDescription(desc, function () {
    //    onSetRemoteSuccess(pc2);
    //}, onSetSessionDescriptionError);

    // Since the 'remote' side has no media stream we need
    // to pass in the right constraints in order for it to
    // accept the incoming offer of audio and video.

    //TODO: pc2.createAnswer(onCreateAnswerSuccess, onCreateSessionDescriptionError);
}

function getOrCreateConnection() {
    if (pc1) return pc1;

    pc1 = new RTCPeerConnection(null);
    trace('Created remote peer connection object pc2');
    pc1.onicecandidate = function (e) {
        onIceCandidate(pc1, e);
    };
    pc1.oniceconnectionstatechange = function (e) {
        onIceStateChange(pc1, e);
    };
    pc1.onaddstream = gotRemoteStream;

    return pc1;
}

hub.client.sdpMessage = function (message) {
    var m = JSON.parse(message);
    if (m.sdp) {
        if (m.sdp.type == 'offer') {
            var conn = getOrCreateConnection();

            trace('pc2 setRemoteDescription start');
            conn.setRemoteDescription(new RTCSessionDescription(m.sdp), function () { onSetRemoteSuccess(pc1); }, onSetSessionDescriptionError);
            trace('pc2 adding Stream');
            conn.addStream(localStream);
            trace('pc2 createAnswer start');
            conn.createAnswer(onCreateAnswerSuccess, onCreateSessionDescriptionError);
        }                    
                    
    }
};

hub.client.answerMessage = function (message) {
    var m = JSON.parse(message);
    if (m.answer) {
        trace('pc1 setRemoteDescription start');
        pc1.setRemoteDescription(m.answer, function () {
            trace('Sending final ack');
            hub.server.sendFinal(JSON.stringify({ 'final': 'done' }));
            onSetRemoteSuccess(pc1);
        }, onSetSessionDescriptionError);
    }
};

hub.client.candidateMessage = function (message) {
    var m = JSON.parse(message);
    if (m.candidate) {
        var conn = getOrCreateConnection();
        conn.addIceCandidate(new RTCIceCandidate(m.candidate),
                function () {
                    onAddIceCandidateSuccess(conn);
                },
                function (err) {
                    onAddIceCandidateError(conn, err);
                }
            );
        trace(getName(conn) + ' ICE candidate: \n' + m.candidate.candidate);
    }
};

hub.client.finalMessage = function (message) {
    trace('Adding the localStream');
    //pc1.addStream(localStream);
}

function onSetLocalSuccess(pc) {
    trace(getName(pc) + ' setLocalDescription complete');
}

function onSetRemoteSuccess(pc) {
    trace(getName(pc) + ' setRemoteDescription complete');
}

function onSetSessionDescriptionError(error) {
    trace('Failed to set session description: ' + error.toString());
}

function gotRemoteStream(e) {
    remoteVideo.srcObject = e.stream;
    trace('pc2 received remote stream');
}

function onCreateAnswerSuccess(desc) {
    trace('Answer from pc2:\n' + desc.sdp);
    trace('pc2 setLocalDescription start');
    //SEND REMOTE
    pc1.setLocalDescription(desc, function () {
        hub.server.sendAnswer(JSON.stringify({'answer': desc}));
        onSetLocalSuccess(pc1);
    }, onSetSessionDescriptionError);    
}

function onIceCandidate(pc, event) {
    if (event.candidate) {
        hub.server.sendCandidate(JSON.stringify({'candidate': event.candidate}));
        
    }
}

function onAddIceCandidateSuccess(pc) {
    trace(getName(pc) + ' addIceCandidate success');
}

function onAddIceCandidateError(pc, error) {
    trace(getName(pc) + ' failed to add ICE Candidate: ' + error.toString());
}

function onIceStateChange(pc, event) {
    if (pc) {
        trace(getName(pc) + ' ICE state: ' + pc.iceConnectionState);
        console.log('ICE state change event: ', event);
    }
}

function hangup() {
    trace('Ending call');
    pc1.close();
    pc1 = null;
    hangupButton.disabled = true;
    callButton.disabled = false;
}
