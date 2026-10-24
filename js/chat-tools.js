(function(){
  const picker=document.getElementById('emoji-picker');
  const button=document.getElementById('emoji-btn');
  const input=document.getElementById('msg-input');
  for(const emoji of ['😀','😂','🤣','😊','😍','😎','😭','😅','🤔','🙃','😴','😡','🥳','👋','👍','👎','👏','🙌','🙏','💪','❤️','💜','💀','🔥','✨','🎉','✅','❌','👀','🎮','💯','🚀']){
    const choice=document.createElement('button');choice.type='button';choice.textContent=emoji;choice.setAttribute('aria-label',emoji);choice.style.cssText='font-size:1.5rem;background:transparent;border:0;padding:.4rem;cursor:pointer';
    choice.onclick=()=>{const start=input.selectionStart,end=input.selectionEnd;input.setRangeText(emoji,start,end,'end');input.dispatchEvent(new Event('input'));input.focus();};picker.appendChild(choice);
  }
  window.toggleEmojiPicker=()=>{picker.hidden=!picker.hidden;button.setAttribute('aria-expanded',String(!picker.hidden));};
  // Paste images/files through the same bounded attachment path as the upload button.
  input.addEventListener('paste',e=>{const files=Array.from(e.clipboardData?.files||[]);if(!files.length||document.getElementById('attach-btn').style.display==='none')return;e.preventDefault();window.handleFileSelect({files,value:''});});
})();
