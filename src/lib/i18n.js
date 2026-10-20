import { ref,watch } from 'vue';
import zhCN from '../locales/zh-CN.js';
import en from '../locales/en.js';

export const supportedLocales=['zh-CN','en'];
export const localeStorageKey='netpunks-locale';
export function resolveLocale(value){return supportedLocales.includes(value)?value:'zh-CN';}
function initialLocale(){try{return typeof window==='undefined'?'zh-CN':resolveLocale(window.localStorage?.getItem(localeStorageKey));}catch{return 'zh-CN';}}
export const locale=ref(initialLocale());
const catalogs={'zh-CN':zhCN,en};

export function translate(language,key,params={}){
  const current=resolveLocale(language);
  const source=String(key ?? '');
  let message=Object.hasOwn(catalogs[current],source)?catalogs[current][source]:source;
  if(typeof message==='object')message=message[new Intl.PluralRules(current).select(Number(params.total ?? params.count ?? 0))] || message.other;
  return message.replace(/\{(\w+)\}/g,(placeholder,name)=>Object.hasOwn(params,name)?String(params[name]):placeholder);
}
export function t(key,params){return translate(locale.value,key,params);}
export function formatNumber(value){return new Intl.NumberFormat(locale.value).format(value);}
export function setLocale(value){locale.value=resolveLocale(value);}

watch(locale,value=>{
  try{if(typeof window!=='undefined')window.localStorage?.setItem(localeStorageKey,value);}catch{}
  if(typeof document==='undefined')return;
  document.documentElement.lang=value;
  document.title=t('NETPUNKS · 找到你的像素身份');
  const description=document.querySelector('meta[name="description"]');
  if(description)description.content=t('NETPUNKS 原创像素头像收藏与交易市场。探索、铸造，找到属于你的像素身份。');
},{immediate:true,flush:'sync'});
