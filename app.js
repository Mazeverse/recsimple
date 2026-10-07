const startBtn=document.getElementById("startBtn");
const pauseBtn=document.getElementById("pauseBtn");
const stopBtn=document.getElementById("stopBtn");
const systemAudio=document.getElementById("systemAudio");
const micAudio=document.getElementById("micAudio");
const timer=document.getElementById("timer");
const statusEl=document.getElementById("status");
const result=document.getElementById("result");
const preview=document.getElementById("preview");
const downloadBtn=document.getElementById("downloadBtn");

let recorder, chunks=[], displayStream, micStream, mixedStream, audioContext;
let startedAt=0, pausedAt=0, totalPaused=0, timerId;

function formatTime(ms){
  const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return [h,m,sec].map(v=>String(v).padStart(2,"0")).join(":");
}
function startTimer(){
  timerId=setInterval(()=>{
    const now=Date.now();
    timer.textContent=formatTime(now-startedAt-totalPaused);
  },250);
}
function stopTracks(){
  [displayStream,micStream,mixedStream].forEach(s=>s?.getTracks().forEach(t=>t.stop()));
  if(audioContext && audioContext.state!=="closed") audioContext.close();
}

startBtn.onclick=async()=>{
  try{
    result.classList.add("hidden");
    chunks=[];
    if(!systemAudio.checked && !micAudio.checked){
      alert("PC/탭 소리 또는 마이크 중 하나를 선택하세요.");
      return;
    }

    let tracks=[];
    if(systemAudio.checked){
      displayStream=await navigator.mediaDevices.getDisplayMedia({
        video:true,
        audio:true
      });
      if(displayStream.getAudioTracks().length===0){
        displayStream.getTracks().forEach(t=>t.stop());
        alert('오디오가 공유되지 않았습니다.\n공유 창에서 "탭 오디오 공유" 또는 "시스템 오디오 공유"를 켜주세요.');
        return;
      }
    }

    if(micAudio.checked){
      micStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    }

    if(systemAudio.checked && micAudio.checked){
      audioContext=new AudioContext();
      const destination=audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(displayStream).connect(destination);
      audioContext.createMediaStreamSource(micStream).connect(destination);
      mixedStream=destination.stream;
      tracks=mixedStream.getAudioTracks();
    }else if(systemAudio.checked){
      tracks=displayStream.getAudioTracks();
    }else{
      tracks=micStream.getAudioTracks();
    }

    const audioOnly=new MediaStream(tracks);
    const preferred=[
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ].find(t=>MediaRecorder.isTypeSupported(t));

    recorder=new MediaRecorder(audioOnly, preferred?{mimeType:preferred}:undefined);
    recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data)};
    recorder.onstop=()=>{
      clearInterval(timerId);
      const type=recorder.mimeType||"audio/webm";
      const blob=new Blob(chunks,{type});
      const url=URL.createObjectURL(blob);
      preview.src=url;
      downloadBtn.href=url;
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      downloadBtn.download=`recsimple-${stamp}.webm`;
      result.classList.remove("hidden");
      statusEl.textContent="녹음 완료";
      startBtn.disabled=false;
      pauseBtn.disabled=true;
      stopBtn.disabled=true;
      pauseBtn.textContent="Ⅱ 일시정지";
      stopTracks();
    };

    recorder.start(1000);
    startedAt=Date.now(); totalPaused=0; pausedAt=0;
    timer.textContent="00:00:00";
    startTimer();
    statusEl.textContent="녹음 중";
    startBtn.disabled=true;
    pauseBtn.disabled=false;
    stopBtn.disabled=false;

    displayStream?.getVideoTracks()[0]?.addEventListener("ended",()=>{
      if(recorder?.state!=="inactive") recorder.stop();
    });
  }catch(err){
    console.error(err);
    stopTracks();
    statusEl.textContent="취소됨 또는 권한 오류";
  }
};

pauseBtn.onclick=()=>{
  if(!recorder) return;
  if(recorder.state==="recording"){
    recorder.pause();
    pausedAt=Date.now();
    pauseBtn.textContent="▶ 계속";
    statusEl.textContent="일시정지";
  }else if(recorder.state==="paused"){
    recorder.resume();
    totalPaused+=Date.now()-pausedAt;
    pauseBtn.textContent="Ⅱ 일시정지";
    statusEl.textContent="녹음 중";
  }
};

stopBtn.onclick=()=>{
  if(recorder && recorder.state!=="inactive") recorder.stop();
};
