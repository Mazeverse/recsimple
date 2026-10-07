const startBtn=document.getElementById("startBtn");
const pauseBtn=document.getElementById("pauseBtn");
const stopBtn=document.getElementById("stopBtn");
const systemAudio=document.getElementById("systemAudio");
const micAudio=document.getElementById("micAudio");
const timer=document.getElementById("timer");
const statusEl=document.getElementById("status");
const segmentsBox=document.getElementById("segmentsBox");
const segmentsEl=document.getElementById("segments");
const fullBox=document.getElementById("fullBox");
const fullPreview=document.getElementById("fullPreview");
const fullDownload=document.getElementById("fullDownload");

const SPLIT_MS=3*60*1000;
let recorder, displayStream, micStream, audioContext, recordingStream;
let fullChunks=[], segmentChunks=[], segmentNo=1;
let startedAt=0, pauseStarted=0, totalPaused=0, timerId=null, splitTimer=null;
let currentSegmentStartedAt=0;
let stopped=false;

function fmt(ms){
  const s=Math.max(0,Math.floor(ms/1000));
  return [Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(v=>String(v).padStart(2,"0")).join(":");
}
function safeStamp(){
  return new Date().toISOString().replace(/[:.]/g,"-");
}
function cleanup(){
  [displayStream,micStream,recordingStream].forEach(s=>s?.getTracks().forEach(t=>t.stop()));
  if(audioContext && audioContext.state!=="closed") audioContext.close();
}
function addSegment(blob, number, startMs, endMs){
  if(!blob.size) return;
  segmentsBox.classList.remove("hidden");
  const url=URL.createObjectURL(blob);
  const row=document.createElement("div");
  row.className="segment";
  const info=document.createElement("div");
  info.className="segment-info";
  const title=document.createElement("strong");
  title.textContent=`구간 ${String(number).padStart(2,"0")} · ${fmt(startMs)} ~ ${fmt(endMs)}`;
  const sub=document.createElement("small");
  sub.textContent="회의 중 바로 저장해서 번역용으로 사용할 수 있습니다.";
  info.append(title,sub);
  const a=document.createElement("a");
  a.className="download";
  a.href=url;
  a.download=`recsimple-part-${String(number).padStart(2,"0")}-${safeStamp()}.webm`;
  a.textContent="구간 저장";
  row.append(info,a);
  segmentsEl.appendChild(row);
}
function finalizeSegment(){
  if(segmentChunks.length===0) return;
  const type=recorder?.mimeType || "audio/webm";
  const elapsed=Date.now()-startedAt-totalPaused;
  const blob=new Blob(segmentChunks,{type});
  addSegment(blob,segmentNo,currentSegmentStartedAt,elapsed);
  segmentChunks=[];
  segmentNo++;
  currentSegmentStartedAt=elapsed;
}
function scheduleSplit(){
  clearInterval(splitTimer);
  splitTimer=setInterval(()=>{
    if(recorder?.state==="recording"){
      recorder.requestData();
      setTimeout(finalizeSegment,100);
    }
  },SPLIT_MS);
}
function beginClock(){
  clearInterval(timerId);
  timerId=setInterval(()=>{
    const extra=recorder?.state==="paused" ? Date.now()-pauseStarted : 0;
    timer.textContent=fmt(Date.now()-startedAt-totalPaused-extra);
  },250);
}

startBtn.onclick=async()=>{
  try{
    if(!systemAudio.checked && !micAudio.checked){
      alert("PC/탭 소리 또는 마이크 중 하나를 선택하세요."); return;
    }
    stopped=false; fullChunks=[]; segmentChunks=[]; segmentNo=1;
    segmentsEl.innerHTML=""; segmentsBox.classList.add("hidden"); fullBox.classList.add("hidden");

    if(systemAudio.checked){
      displayStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
      if(displayStream.getAudioTracks().length===0){
        displayStream.getTracks().forEach(t=>t.stop());
        alert('오디오가 공유되지 않았습니다.\n"탭 오디오와 함께 공유"를 켜주세요.'); return;
      }
    }
    if(micAudio.checked){
      micStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    }

    let audioTracks=[];
    if(systemAudio.checked && micAudio.checked){
      audioContext=new AudioContext();
      const dest=audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(displayStream).connect(dest);
      audioContext.createMediaStreamSource(micStream).connect(dest);
      recordingStream=dest.stream;
      audioTracks=recordingStream.getAudioTracks();
    }else if(systemAudio.checked){
      audioTracks=displayStream.getAudioTracks();
    }else{
      audioTracks=micStream.getAudioTracks();
    }

    const audioOnly=new MediaStream(audioTracks);
    const preferred=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t));
    recorder=new MediaRecorder(audioOnly,preferred?{mimeType:preferred}:undefined);

    recorder.ondataavailable=e=>{
      if(e.data && e.data.size){
        fullChunks.push(e.data);
        segmentChunks.push(e.data);
      }
    };
    recorder.onstop=()=>{
      if(stopped) return;
      stopped=true;
      clearInterval(timerId); clearInterval(splitTimer);
      recorder.requestData?.();
      setTimeout(()=>{
        finalizeSegment();
        const type=recorder.mimeType||"audio/webm";
        const fullBlob=new Blob(fullChunks,{type});
        const url=URL.createObjectURL(fullBlob);
        fullPreview.src=url;
        fullDownload.href=url;
        fullDownload.download=`recsimple-full-${safeStamp()}.webm`;
        fullBox.classList.remove("hidden");
        statusEl.textContent="녹음 완료 · 전체 파일 준비됨";
        startBtn.disabled=false; pauseBtn.disabled=true; stopBtn.disabled=true;
        pauseBtn.textContent="Ⅱ 일시정지";
        cleanup();
      },150);
    };

    recorder.start(1000); // 1초 단위 데이터 생성: 전체 파일과 3분 조각 모두 유지
    startedAt=Date.now(); totalPaused=0; pauseStarted=0; currentSegmentStartedAt=0;
    timer.textContent="00:00:00"; beginClock(); scheduleSplit();
    statusEl.textContent="녹음 중 · 3분마다 자동 분할";
    startBtn.disabled=true; pauseBtn.disabled=false; stopBtn.disabled=false;

    displayStream?.getVideoTracks()[0]?.addEventListener("ended",()=>{
      if(recorder && recorder.state!=="inactive") recorder.stop();
    });
  }catch(err){
    console.error(err); cleanup();
    statusEl.textContent="취소됨 또는 권한 오류";
  }
};

pauseBtn.onclick=()=>{
  if(!recorder) return;
  if(recorder.state==="recording"){
    recorder.pause(); pauseStarted=Date.now();
    pauseBtn.textContent="▶ 계속"; statusEl.textContent="일시정지";
  }else if(recorder.state==="paused"){
    recorder.resume(); totalPaused+=Date.now()-pauseStarted;
    pauseBtn.textContent="Ⅱ 일시정지"; statusEl.textContent="녹음 중 · 3분마다 자동 분할";
  }
};
stopBtn.onclick=()=>{
  if(recorder && recorder.state!=="inactive") recorder.stop();
};
