'use client';
export function useLocalUpload(_endpoint:string,options:{onUploadProgress:(progress:number)=>void}){
  return {startUpload:(files:File[])=>new Promise<{ufsUrl:string}[]>((resolve,reject)=>{
    const request=new XMLHttpRequest();request.open('POST','/api/local-images');
    request.upload.onprogress=event=>{if(event.lengthComputable)options.onUploadProgress(Math.round(event.loaded/event.total*100));};
    request.onload=()=>{try{if(request.status!==200)throw new Error('Upload failed');resolve(JSON.parse(request.responseText));}catch(error){reject(error);}};
    request.onerror=()=>reject(new Error('Upload failed'));
    const data=new FormData();files.forEach(file=>data.append('files',file));request.send(data);
  })};
}
