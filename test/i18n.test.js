import {afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {locale,setLocale,resolveLocale,translate,t} from '../src/lib/i18n.js';
import {relativeTime} from '../src/lib/api.js';

afterEach(()=>setLocale('zh-CN'));

test('switching language updates UI copy and trait labels while keeping source keys stable',()=>{
  setLocale('en');assert.equal(t('探索市场'),'Explore');assert.equal(t('Human'),'Human');
  setLocale('zh-CN');assert.equal(t('探索市场'),'探索市场');assert.equal(t('Human'),'人类');
  assert.equal(t('Small pixels.'),'小小像素。');
  assert.equal(t('NETPUNK #42'),'NETPUNK #42');
  assert.equal(resolveLocale('unsupported'),'zh-CN');
});
test('dynamic counts and pagination retain values and use English singular or plural',()=>{
  assert.equal(translate('en','{total} 个收藏品',{total:1}),'1 collectible');
  assert.equal(translate('en','{total} 个收藏品',{total:48}),'48 collectibles');
  assert.equal(translate('en','第 {page} 页，共 {pages} 页',{page:2,pages:3}),'Page 2 of 3');
  assert.equal(translate('zh-CN','查看 NETPUNK #{id}',{id:42}),'查看 NETPUNK #42');
});
test('relative times and transaction errors follow the active language',()=>{
  const now=Math.floor(Date.now()/1000);
  setLocale('en');assert.equal(relativeTime(now-65),'1 minute ago');assert.equal(relativeTime(now-125),'2 minutes ago');
  assert.equal(t('售价已变化，请刷新后确认'),'The asking price changed. Refresh to confirm it.');
  setLocale('zh-CN');assert.equal(relativeTime(now-65),'1 分钟前');
});
test('language preference is persisted and unavailable storage does not break switching',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'window');
  const values=new Map();
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{setItem:(key,value)=>values.set(key,value)}}});
    setLocale('en');assert.equal(locale.value,'en');assert.equal(values.get('netpunks-locale'),'en');
    Object.defineProperty(globalThis.window,'localStorage',{configurable:true,get(){throw new Error('Storage unavailable');}});
    assert.doesNotThrow(()=>setLocale('zh-CN'));assert.equal(locale.value,'zh-CN');
  }finally{if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window;}
});
