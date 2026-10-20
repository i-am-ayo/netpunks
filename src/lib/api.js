export async function api(path,params) {
  const query=params ? `?${new URLSearchParams(Object.entries(params).filter(([,value])=>value!=='' && value!==undefined))}` : '';
  const response=await fetch(`/api${path}${query}`,{signal:AbortSignal.timeout(15000)});
  let data;
  try {data=await response.json();}catch{throw new Error('服务尚未就绪，请稍后刷新。');}
  if(!response.ok)throw new Error(data.error || '请求失败，请稍后重试');
  return data;
}
export const shortAddress=value=>value ? `${value.slice(0,6)}…${value.slice(-4)}` : '';
export const ether=value=>{
  if(!value || value==='0')return '0';
  const whole=BigInt(value)/10n**18n;
  const fraction=String(BigInt(value)%10n**18n).padStart(18,'0').slice(0,5).replace(/0+$/,'');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
};
export const imageUrl=id=>`/api/punks/${id}/image.svg`;
export const relativeTime=timestamp=>{
  const seconds=Math.max(0,Math.floor(Date.now()/1000-timestamp));
  return seconds<60 ? t('刚刚') : seconds<3600 ? t('{count} 分钟前',{count:Math.floor(seconds/60)}) : seconds<86400 ? t('{count} 小时前',{count:Math.floor(seconds/3600)}) : t('{count} 天前',{count:Math.floor(seconds/86400)});
};
export const eventLabels={mint:'铸造',transfer:'转赠',listed:'上架',cancelled:'取消挂单',sale:'成交',bid:'出价','bid-withdrawn':'出价退回',withdrawal:'提款'};
import {t} from './i18n.js';

