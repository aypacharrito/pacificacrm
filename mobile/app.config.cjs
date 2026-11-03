const fs=require('node:fs');
module.exports=({config})=>{
 const googleServicesFile=process.env.GOOGLE_SERVICES_JSON||'./google-services.json';
 if(process.env.EAS_BUILD_PLATFORM==='android'&&!fs.existsSync(googleServicesFile))throw Error('Pacifica Android incoming calls need GOOGLE_SERVICES_JSON (an EAS file variable) or mobile/google-services.json. No background-call build should ship without Firebase configuration.');
 return {...config,android:{...config.android,...(fs.existsSync(googleServicesFile)?{googleServicesFile}:{})}};
};
