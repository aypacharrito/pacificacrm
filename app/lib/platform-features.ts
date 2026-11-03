export type PlatformFeatures={miner:boolean;industryTools:boolean};
export const defaultPlatformFeatures:PlatformFeatures={miner:false,industryTools:false};
export function cleanPlatformFeatures(value:unknown):PlatformFeatures{const v=value&&typeof value==='object'?value as Record<string,unknown>:{};return {miner:v.miner===true,industryTools:v.industryTools===true}}
