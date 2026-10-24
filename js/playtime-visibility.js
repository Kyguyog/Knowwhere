(function(root){
  const maxAgeMs=14*24*60*60*1000;
  const visibility={
    isVisible(row,now=Date.now()){
      const value=row.lastPlayedAt;
      if(value==null||value==='')return false;
      const timestamp=typeof value.toMillis==='function'?value.toMillis():value instanceof Date?value.getTime():typeof value==='number'?value:Date.parse(value);
      return Number.isFinite(timestamp)&&timestamp>now-maxAgeMs;
    },
    recent(rows,now=Date.now()){return rows.filter(row=>visibility.isVisible(row,now));}
  };
  if(typeof module==='object')module.exports=visibility;else root.KWPlaytimeVisibility=visibility;
})(typeof window==='object'?window:globalThis);
