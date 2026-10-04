// Reuses the accepted resumable engine. Reads at most one 6 MiB file range.
import { open,stat } from 'node:fs/promises';
import { uploadResumable } from '../dist/account/resumable-upload.js';
export async function uploadGatewayFile({backend,bucket,path,filePath,mime,fetchImpl=fetch}) {
 if(backend.url!=='https://upvtrczefcvigxdyuylw.supabase.co')throw Error('TESTING_GATEWAY_ONLY');
 const file=await open(filePath,'r'); const {size}=await stat(filePath);const headers=backend.headers(null);
 try {
  await uploadResumable({endpoint:`${backend.url}/functions/v1/usage-upload/tus`,bucketName:bucket,objectName:path,contentType:mime,
   token:headers.Authorization?.replace(/^Bearer\s+/,''),apikey:headers.apikey,fetcher:fetchImpl,terminateOnFailure:true,
   file:{size,slice:async(start,end,type)=>{const buffer=Buffer.alloc(end-start);let offset=0;while(offset<buffer.length){const {bytesRead}=await file.read(buffer,offset,buffer.length-offset,start+offset);if(!bytesRead)throw Error('DERIVATIVE_FILE_TRUNCATED');offset+=bytesRead;}return new Blob([buffer],{type});}}
  });
 } finally {await file.close();}
}
export async function deleteGatewayObject(backend,bucket,path,fetchImpl=fetch) {
 if(backend.url!=='https://upvtrczefcvigxdyuylw.supabase.co')throw Error('TESTING_GATEWAY_ONLY');
 const r=await fetchImpl(`${backend.url}/functions/v1/usage-upload/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',headers:backend.headers(null)});
 if(!r.ok)throw Error(`STORAGE_CLEANUP_${r.status}`);
}
