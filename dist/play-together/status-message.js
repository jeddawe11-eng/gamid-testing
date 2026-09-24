export const SUCCESS_MESSAGE_MS = 5000;

export function createStatusMessage(node, { setTimer=setTimeout, clearTimer=clearTimeout }={}) {
  let timer = null;
  return function message(text, ok=false) {
    clearTimer(timer);
    timer = null;
    node.textContent=text;
    node.classList.toggle("success",ok);
    node.hidden=!text;
    if(ok && text) timer=setTimer(()=>{
      if(node.textContent===text && node.classList.contains("success")) message("");
    },SUCCESS_MESSAGE_MS);
  };
}
