<script setup>
import { ref,reactive,computed,watch,onMounted,onUnmounted,nextTick } from 'vue';
import { PhArrowUpRight,PhArrowRight,PhArrowLeft,PhWallet,PhMagnifyingGlass,PhSlidersHorizontal,PhSquaresFour,PhGridNine,PhX,PhCaretDown,PhCheck,PhCopy,PhSun,PhMoon,PhArrowSquareOut,PhHeart,PhPlus,PhMinus,PhArrowClockwise,PhWarningCircle,PhStack,PhGavel,PhSignOut,PhLightning,PhBookOpen,PhCheckCircle,PhSpinnerGap,PhGlobe } from '@phosphor-icons/vue';
import PunkCard from './components/PunkCard.vue';
import ActivityList from './components/ActivityList.vue';
import {t,locale,setLocale,formatNumber} from './lib/i18n';
import { api,ether,shortAddress,imageUrl } from './lib/api';
import { wallet,configureWallet,canUseDemo,connectDemo,connectInjected,disconnectWallet,restoreWallet,refreshWallet,execute,explainError } from './lib/wallet';
import { DEMO_ACCOUNTS } from '../shared/demo-accounts.js';

const config=ref(null),stats=ref(null),punks=ref([]),events=ref([]),detail=ref(null);
const loading=ref(true),listLoading=ref(false),error=ref(''),listError=ref('');
const route=ref(location.hash || '#/explore');
const view=computed(()=>route.value.split('/')[1] || 'explore');
const modal=ref(''),dialog=ref(null),busy=ref(false),txStatus=ref(''),actionError=ref(''),walletBusy=ref(false);
const actionPunk=ref(null);
const selectedDemoIndex=ref(14);
const selectedDemoAccount=computed(()=>DEMO_ACCOUNTS.find(account=>account.index===selectedDemoIndex.value) || DEMO_ACCOUNTS[0]);
watch(()=>wallet.mode,mode=>{
  const account=DEMO_ACCOUNTS.find(account=>mode===`demo-${account.index}`);
  if(account)selectedDemoIndex.value=account.index;
});
const toast=ref(''),total=ref(0),page=ref(1),dense=ref(false),mobileFilters=ref(false);
const tab=ref('all'),search=ref(''),sort=ref('id'),filters=reactive({type:'',hair:'',eyes:'',minPrice:'',maxPrice:''});
const activityFilter=ref('all'),collectionTab=ref('owned'),mintQuantity=ref(1);
const form=reactive({action:'',price:'',to:'',onlyBuyer:'',open:true});
let saved=[];try{saved=JSON.parse(localStorage.getItem('netpunks-favorites') || '[]');}catch{}
const favorites=ref(Array.isArray(saved)?saved:[]);
const theme=ref(localStorage.getItem('netpunks-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
const limit=computed(()=>dense.value?30:20);
const pages=computed(()=>Math.max(1,Math.ceil(total.value/limit.value)));
const isOwner=computed(()=>detail.value && wallet.address && detail.value.owner.toLowerCase()===wallet.address.toLowerCase());
const isBidder=computed(()=>detail.value && wallet.address && detail.value.bidder.toLowerCase()===wallet.address.toLowerCase());
const isAdmin=computed(()=>wallet.address && config.value?.admin.toLowerCase()===wallet.address.toLowerCase());
const isLocalNetwork=computed(()=>!config.value || config.value.chainId===31337);
const networkNotice=computed(()=>isLocalNetwork.value?'当前运行于本地 Hardhat 测试链，使用测试 ETH。':'当前运行于 Sepolia 测试网，使用 Sepolia 测试 ETH。');
const soldOut=computed(()=>config.value?.totalMinted>=10000);
const nextMintId=computed(()=>Math.min(config.value?.totalMinted || 0,9999));
const selectedFilters=computed(()=>Object.entries(filters).filter(([,v])=>v));
const collectionItems=computed(()=>collectionTab.value==='bids'?wallet.bids:collectionTab.value==='listed'?wallet.owned.filter(p=>p.price!=='0'):wallet.owned);
const heroIds=[3,11,22,7,30,40,17,25,6,41,14,1,35,19,29,44,15,23,5,37,10,18,31,4,26,43,12,38];
const typeOptions=[['Human','人类'],['Zombie','僵尸'],['Alien','外星人']];
const hairOptions=['Crop','Mohawk','Bob','Cap','Beanie','Wild','Bald','Side part'];
let searchTimer,toastTimer,listVersion=0,detailVersion=0;

function notify(message){toast.value=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.value='',4000);}
function scrollMarket(){document.getElementById('market')?.scrollIntoView({behavior:'smooth'});}
function toggleFavorite(id){favorites.value=favorites.value.includes(id)?favorites.value.filter(n=>n!==id):[...favorites.value,id];localStorage.setItem('netpunks-favorites',JSON.stringify(favorites.value));if(tab.value==='favorites')loadPunks();}
async function copy(text){try{await navigator.clipboard.writeText(text);notify('已复制到剪贴板');}catch{notify('复制失败，请手动复制地址');}}
function clearFilters(){Object.assign(filters,{type:'',hair:'',eyes:'',minPrice:'',maxPrice:''});search.value='';page.value=1;}
function openModal(name){actionError.value='';modal.value=name;}
function closeModal(){if(!busy.value&&!walletBusy.value)modal.value='';}
function handleBackdrop(event){if(event.target===event.currentTarget)closeModal();}
function startAction(action){actionPunk.value=detail.value;Object.assign(form,{action,price:action==='list'&&detail.value?.price!=='0'?ether(detail.value.price):'',to:'',onlyBuyer:'',open:config.value?.mintOpen});openModal('action');}
async function loadPunks(){
  const version=++listVersion;listLoading.value=true;listError.value='';
  try{
    const data=await api('/punks',{q:typeOptions.find(([value,label])=>[value.toLowerCase(),label,t(value).toLowerCase()].includes(search.value.trim().toLowerCase()))?.[0] || search.value,type:filters.type,hair:filters.hair,eyes:filters.eyes,minPrice:filters.minPrice,maxPrice:filters.maxPrice,status:tab.value==='listed'?'listed':tab.value==='bids'?'bids':'',sort:sort.value,page:page.value,limit:limit.value,ids:tab.value==='favorites'?(favorites.value.join(',') || 'none'):''});
    if(version!==listVersion)return;punks.value=data.items;total.value=data.total;
  }catch(e){if(version===listVersion)listError.value=e.message;}
  finally{if(version===listVersion)listLoading.value=false;}
}
async function loadDetail(){
  const version=++detailVersion;listError.value='';
  const id=route.value.split('/')[2];
  if(detail.value?.id!==Number(id))detail.value=null;
  if(!/^\d+$/.test(id || '')){listError.value='这个 NFT 编号无效';return;}
  try{const data=await api(`/punks/${id}`);if(version===detailVersion)detail.value=data;}
  catch(e){if(version===detailVersion)listError.value=e.message;}
}
async function loadActivity(){try{events.value=await api('/activity',{kind:activityFilter.value});}catch(e){listError.value=e.message;}}
async function refreshAll(){
  config.value=await api('/config',{fresh:'1'});configureWallet(config.value);
  const results=await Promise.all([api('/stats'),api('/activity',{kind:activityFilter.value}),refreshWallet()]);
  stats.value=results[0];events.value=results[1];
  if(view.value==='punk')await loadDetail();else await loadPunks();
}
async function boot(){
  loading.value=true;error.value='';
  try{
    config.value=await api('/config');configureWallet(config.value);
    await restoreWallet().catch(()=>disconnectWallet());
    await refreshAll();
  }catch(e){error.value=e.message;}
  finally{loading.value=false;}
}
async function connect(mode){
  walletBusy.value=true;actionError.value='';
  try{
    if(mode==='metamask')await connectInjected();else await connectDemo(Number(mode));
    modal.value='';notify(wallet.mode.startsWith('demo')?'已连接本地体验账户，使用测试 ETH':'钱包已连接');
  }catch(e){actionError.value=explainError(e);}
  finally{walletBusy.value=false;}
}
async function perform(action,args={}){
  if(!wallet.address){openModal('wallet');return;}
  if(busy.value)return;
  busy.value=true;actionError.value='';
  try{
    await execute(action,args,status=>txStatus.value=status);
    txStatus.value='交易已确认，正在更新资产';
    await refreshAll();modal.value='';notify('交易成功，资产与市场状态已更新');
  }catch(e){actionError.value=explainError(e);}
  finally{busy.value=false;txStatus.value='';}
}
function submitAction(){
  const id=actionPunk.value?.id;
  const price=['buy'].includes(form.action)?actionPunk.value.price:form.action==='accept'?actionPunk.value.bid:form.price;
  perform(form.action,{id,price,to:form.to,onlyBuyer:form.onlyBuyer,quantity:form.open});
}
function handleHash(){route.value=location.hash || '#/explore';window.scrollTo({top:0,behavior:'instant'});mobileFilters.value=false;}
function handleWalletChange(){if(wallet.mode==='injected'){disconnectWallet();notify('钱包账户或网络已变化，请重新连接');}}
watch(theme,value=>{document.documentElement.dataset.theme=value;localStorage.setItem('netpunks-theme',value);},{immediate:true});
watch(modal,async value=>{await nextTick();if(value && dialog.value && !dialog.value.open)dialog.value.showModal();});
watch([tab,sort,dense,()=>filters.type,()=>filters.hair,()=>filters.eyes,()=>filters.minPrice,()=>filters.maxPrice],()=>{page.value=1;if(config.value)loadPunks();});
watch(search,()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page.value=1;loadPunks();},260);});
watch(page,()=>{if(config.value)loadPunks();});
watch(activityFilter,()=>{if(config.value)loadActivity();});
watch(route,()=>{
  listError.value='';if(!config.value)return;
  if(view.value==='punk')loadDetail();else if(view.value==='activity')loadActivity();else if(view.value==='collection')refreshWallet().catch(e=>notify(e.message));else if(view.value==='explore')loadPunks();
});
onMounted(()=>{window.addEventListener('hashchange',handleHash);window.ethereum?.on?.('accountsChanged',handleWalletChange);window.ethereum?.on?.('chainChanged',handleWalletChange);boot();});
onUnmounted(()=>{window.removeEventListener('hashchange',handleHash);window.ethereum?.removeListener?.('accountsChanged',handleWalletChange);window.ethereum?.removeListener?.('chainChanged',handleWalletChange);clearTimeout(searchTimer);clearTimeout(toastTimer);});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" href="#/explore" :aria-label="t('NETPUNKS 首页')"><span class="brand-mark"><i></i><i></i><i></i><i></i><i></i></span>netpunks<span class="brand-period">.</span></a>
      <nav class="main-nav" :aria-label="t('主导航')">
        <a href="#/explore" :class="{active:['explore','punk'].includes(view)}">{{ t('探索市场') }}</a>
        <a href="#/mint" :class="{active:view==='mint'}">{{ t('铸造') }} <span class="nav-new">{{soldOut?t('SOLD'):config&&!config.mintOpen?t('PAUSED'):t('OPEN')}}</span></a>
        <a href="#/activity" :class="{active:view==='activity'}">{{ t('市场动态') }}</a>
        <a href="#/collection" :class="{active:view==='collection'}">{{ t('我的收藏') }}</a>
        <a :href="locale==='en'?'/docs/uml/en/index.html':'/docs/uml/index.html'">{{ t('UML 图册') }}</a>
      </nav>
      <div class="header-actions">
        <label class="language-switch"><PhGlobe :size="16"/><select :value="locale" :aria-label="t('切换语言')" @change="setLocale($event.target.value)"><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
        <button class="icon-button theme-button" :aria-label="theme==='light'?t('切换深色模式'):t('切换浅色模式')" @click="theme=theme==='light'?'dark':'light'"><PhMoon v-if="theme==='light'" :size="19"/><PhSun v-else :size="19"/></button>
        <span class="network-label"><span></span>{{ isLocalNetwork?t('本地测试链'):config?.chainName }}</span>
        <button class="button wallet-button" :aria-label="wallet.address?shortAddress(wallet.address):t('连接钱包')" @click="openModal('wallet')"><PhWallet :size="18"/><span class="wallet-button-label">{{wallet.address?shortAddress(wallet.address):t('连接钱包')}}</span></button>
      </div>
    </header>

    <main class="main-content">
      <div v-if="loading" class="page-loading"><span class="brand-mark large"><i></i><i></i><i></i><i></i><i></i></span><h1>{{ t('正在打开像素世界') }}</h1><p>{{ t('同步链上的收藏与交易记录。') }}</p></div>
      <div v-else-if="error" class="empty-page"><PhWarningCircle :size="42"/><h1>{{ t('市场暂时没有连接') }}</h1><p>{{t(error)}}</p><button class="button primary" @click="boot"><PhArrowClockwise :size="18"/>{{ t('重新连接') }}</button></div>

      <template v-else>
        <template v-if="view==='explore' || !['punk','mint','activity','collection','admin'].includes(view)">
          <section class="hero">
            <div class="hero-copy">
              <div class="hero-eyebrow"><span class="mini-pixels">▦</span> {{ t('ORIGINAL PIXELS. YOUR IDENTITY.') }}</div>
              <h1>{{ t('Small pixels.') }}<br/><span>{{ t('Big personalities.') }}</span></h1>
              <p>{{ t('10,000 个独一无二的像素角色。') }} <br class="mobile-break"/>{{ t('找到那个，一眼就像你的。') }}</p>
              <div class="hero-actions"><a href="#market" class="button primary" @click.prevent="scrollMarket">{{ t('探索收藏') }} <PhArrowUpRight :size="19"/></a><a href="#/mint" class="hero-secondary">{{ t('铸造你的 PUNK') }} <PhArrowRight :size="18"/></a></div>
              <div class="hero-note"><PhCheckCircle :size="15"/>{{ t('原创生成艺术') }} <span>/</span> {{ t('链上拥有') }} <span>/</span> {{ t('自由交易') }}</div>
            </div>
            <div class="hero-art" :aria-label="t('NETPUNKS 原创像素头像系列')">
              <div class="mosaic"><a v-for="id in heroIds" :key="id" :href="`#/punk/${id}`" :aria-label="t('查看 NETPUNK #{id}',{id:id})"><img :src="imageUrl(id)" :alt="`NETPUNK #${id}`" width="72" height="72" /></a></div>
              <div class="mosaic-caption"><span>{{ t('24 × 24 pixels.') }}</span><span>{{ t('Endless character.') }} <PhArrowUpRight :size="15"/></span></div>
            </div>
          </section>

          <section class="stats-strip" :aria-label="t('系列统计')">
            <div class="collection-label"><span class="collection-glyph"><PhStack :size="23"/></span><div><strong>NETPUNKS</strong><span>{{ t('原创像素头像系列') }}</span></div><PhCheckCircle :size="17" weight="fill" class="verified"/></div>
            <div class="stat"><span>{{ t('地板价') }}</span><strong>{{stats.listed?ether(stats.floor):t('暂无')}} <small v-if="stats.listed">ETH</small></strong></div>
            <div class="stat"><span>{{ t('总成交额') }}</span><strong>{{ether(stats.volume)}} <small>ETH</small></strong></div>
            <div class="stat"><span>{{ t('持有者数量') }}</span><strong>{{formatNumber(stats.holders)}}</strong></div>
            <div class="stat"><span>{{ t('已铸造 / 总量') }}</span><strong>{{stats.totalMinted}} <small>/ 10,000</small></strong></div>
            <button class="icon-button stats-info" :aria-label="t('了解系列')" @click="openModal('about')"><PhArrowUpRight :size="20"/></button>
          </section>

          <section id="market" class="market-section">
            <div class="market-heading"><div><h2>{{ t('找到你的像素身份') }}<span class="heading-period">.</span></h2><p>{{ t('每一个小小角色，都有自己的不同。') }}</p></div><button class="text-button" @click="openModal('about')">{{ t('关于这个系列') }} <PhArrowUpRight :size="16"/></button></div>
            <div class="market-tabs" role="tablist" :aria-label="t('市场分类')">
              <button :class="{active:tab==='all'}" role="tab" :aria-selected="tab==='all'" @click="tab='all'">{{ t('全部 NFT') }} <span>{{stats.totalMinted}}</span></button>
              <button :class="{active:tab==='listed'}" role="tab" :aria-selected="tab==='listed'" @click="tab='listed'">{{ t('正在出售') }} <span>{{stats.listed}}</span></button>
              <button :class="{active:tab==='bids'}" role="tab" :aria-selected="tab==='bids'" @click="tab='bids'">{{ t('有出价') }}</button>
              <button :class="{active:tab==='favorites'}" role="tab" :aria-selected="tab==='favorites'" @click="tab='favorites'"><PhHeart :size="16"/>{{ t('已收藏') }} <span>{{favorites.length}}</span></button>
            </div>
            <div class="market-layout">
              <aside class="filters" :class="{'mobile-open':mobileFilters}">
                <div class="filter-title"><span><PhSlidersHorizontal :size="18"/>{{ t('筛选') }}</span><button class="text-button muted" @click="clearFilters">{{ t('重置') }}</button></div>
                <div class="filter-group"><h3>{{ t('角色类型') }} <PhCaretDown :size="13"/></h3><label v-for="[value,label] in typeOptions" :key="value" class="checkbox-row"><input type="checkbox" :checked="filters.type===value" @change="filters.type=filters.type===value?'':value"/><span>{{t(label)}} <small v-if="locale==='zh-CN'">{{value}}</small></span><span class="filter-count">{{formatNumber(config.traitCounts[`type:${value}`])}}</span></label></div>
                <div class="filter-group"><h3>{{ t('价格范围') }} <span>ETH</span></h3><div class="price-inputs"><input v-model.lazy="filters.minPrice" inputmode="decimal" :placeholder="t('最低价')" :aria-label="t('最低价格 ETH')"/><span>{{ t('至') }}</span><input v-model.lazy="filters.maxPrice" inputmode="decimal" :placeholder="t('最高价')" :aria-label="t('最高价格 ETH')"/></div></div>
                <div class="filter-group"><h3>{{ t('发型') }} <PhCaretDown :size="13"/></h3><div class="trait-chips"><button v-for="hair in hairOptions" :key="hair" :class="{selected:filters.hair===hair}" @click="filters.hair=filters.hair===hair?'':hair">{{t(hair)}}</button></div></div>
                <div class="filter-group"><h3>{{ t('眼部配饰') }} <PhCaretDown :size="13"/></h3><select v-model="filters.eyes" :aria-label="t('眼部配饰筛选')"><option value="">{{ t('全部配饰') }}</option><option :value="eye" v-for="eye in ['Classic','Shades','Round glasses','3D glasses','Eye patch']" :key="eye">{{t(eye)}}</option></select></div>
                <div class="filter-footnote">{{ t('属性数量按完整 10,000 枚系列统计。') }}</div>
                <a class="mint-side" href="#/mint"><PhSparkleIcon/><strong>{{ t('你的 PUNK，等你创造。') }}</strong><span>{{ t('铸造开放中') }} <PhArrowUpRight :size="15"/></span></a>
              </aside>
              <div class="gallery-content">
                <div class="gallery-toolbar"><button class="icon-button mobile-filter-button" :aria-label="t('展开筛选')" @click="mobileFilters=!mobileFilters"><PhSlidersHorizontal :size="20"/></button><label class="search-field"><PhMagnifyingGlass :size="18"/><input v-model="search" type="search" :placeholder="t('搜索编号或角色类型')" :aria-label="t('搜索 NFT')"/><span class="search-key">#</span></label><select v-model="sort" class="sort-select" :aria-label="t('排序方式')"><option value="id">{{ t('编号：从小到大') }}</option><option value="price-asc">{{ t('价格：从低到高') }}</option><option value="price-desc">{{ t('价格：从高到低') }}</option><option value="newest">{{ t('最新铸造') }}</option></select><div class="view-toggle"><button :class="{active:!dense}" class="icon-button" :aria-label="t('标准网格')" :aria-pressed="!dense" @click="dense=false"><PhSquaresFour :size="19"/></button><button :class="{active:dense}" class="icon-button" :aria-label="t('紧凑网格')" :aria-pressed="dense" @click="dense=true"><PhGridNine :size="19"/></button></div></div>
                <div class="gallery-summary"><span>{{listLoading?t('正在更新…'):t('{total} 个收藏品',{total:total})}}</span><span class="gallery-live">{{ t('链上数据') }} <PhCheck :size="13"/></span></div>
                <div v-if="selectedFilters.length" class="selected-filters"><button v-for="[key,value] in selectedFilters" :key="key" @click="filters[key]=''">{{t(value)}} <PhX :size="12"/></button></div>
                <div v-if="listError" class="inline-error" role="alert">{{t(listError)}}<button class="text-button" @click="loadPunks">{{ t('重试') }}</button></div>
                <div v-else-if="!punks.length&&!listLoading" class="empty-state gallery-empty"><PhMagnifyingGlass :size="35"/><h3>{{ t('还没有找到这个角色') }}</h3><p>{{ t('试试其他属性，或清除当前筛选。') }}</p><button class="button" @click="clearFilters();tab='all'">{{ t('清除筛选') }}</button></div>
                <div v-else class="punk-grid" :class="{dense,'is-updating':listLoading}"><PunkCard v-for="punk in punks" :key="punk.id" :punk="punk" :favorite="favorites.includes(punk.id)" @favorite="toggleFavorite"/></div>
                <div v-if="total>limit" class="pagination"><span>{{ t('第 {page} 页，共 {pages} 页',{page,pages}) }}</span><button class="button" :disabled="page<=1" @click="page--"><PhArrowLeft :size="15"/>{{ t('上一页') }}</button><button class="button" :disabled="page>=pages" @click="page++">{{ t('下一页') }}<PhArrowRight :size="15"/></button></div>
              </div>
            </div>
          </section>
          <section class="recent-section"><div class="section-line"><h2>{{ t('最近的链上足迹') }}</h2><a class="text-button" href="#/activity">{{ t('查看全部') }} <PhArrowUpRight :size="17"/></a></div><ActivityList :events="events.slice(0,5)" compact @copy="copy"/></section>
        </template>

        <template v-else-if="view==='punk'">
          <a href="#/explore" class="back-link"><PhArrowLeft :size="17"/>{{ t('返回探索市场') }}</a>
          <div v-if="listError" class="empty-state"><h2>{{t(listError)}}</h2><a class="button" href="#/explore">{{ t('浏览其他 NFT') }}</a></div>
          <div v-else-if="!detail" class="empty-state">{{ t('正在读取 NFT…') }}</div>
          <template v-else>
            <section class="detail-layout"><div class="detail-art-wrap"><img class="detail-art" :src="imageUrl(detail.id)" :alt="`NETPUNK #${detail.id}`" width="480" height="480"/><div class="detail-art-caption"><span>{{ t('ORIGINAL 24 × 24') }}</span><button class="text-button" @click="toggleFavorite(detail.id)"><PhHeart :size="18" :weight="favorites.includes(detail.id)?'fill':'regular'"/>{{favorites.includes(detail.id)?t('已收藏'):t('收藏')}}</button></div></div>
              <div class="detail-info"><span class="detail-series">NETPUNKS <PhCheckCircle :size="16" weight="fill"/></span><h1>NETPUNK<br/>#{{String(detail.id).padStart(4,'0')}}</h1><div class="owner-row">{{ t('持有者') }} <button class="text-button" @click="copy(detail.owner)">{{isOwner?t('你'):shortAddress(detail.owner)}}<PhCopy :size="14"/></button></div>
                <div class="detail-traits"><div v-for="[key,label] in [['type','类型'],['hair','发型'],['eyes','配饰']]" :key="key"><span>{{t(label)}}</span><strong>{{t(detail.traits[key])}}</strong><small>{{t('{percent}% 拥有此属性',{percent:((config.traitCounts[`${key}:${detail.traits[key]}`]/10000)*100).toFixed(2)})}}</small></div></div>
                <div class="purchase-panel"><span class="small-label">{{detail.price!=='0'?t('当前售价'):t('暂未上架')}}</span><div class="detail-price">{{detail.price!=='0'?ether(detail.price):t('暂无售价')}} <small v-if="detail.price!=='0'">ETH</small></div><p v-if="detail.onlyBuyer!=='0x0000000000000000000000000000000000000000'">{{ t('指定买家：') }}{{shortAddress(detail.onlyBuyer)}}</p>
                  <div v-if="isOwner" class="detail-action-row"><button class="button primary" @click="startAction('list')">{{detail.price!=='0'?t('修改售价'):t('上架出售')}}<PhArrowUpRight :size="18"/></button><button v-if="detail.price!=='0'" class="button" @click="startAction('cancel')">{{ t('取消挂单') }}</button><button class="button" @click="startAction('transfer')">{{ t('转赠') }}</button></div>
                  <div v-else class="detail-action-row"><button v-if="detail.price!=='0'" class="button primary" @click="startAction('buy')">{{ t('立即购买') }}<PhArrowUpRight :size="18"/></button><button class="button" :class="{primary:detail.price==='0'}" @click="startAction('bid')"><PhGavel :size="18"/>{{ t('提出出价') }}</button></div>
                  <div class="trade-note">{{ t('市场手续费 0%。链上操作需支付 Gas。') }}</div>
                </div>
                <div v-if="detail.bid!=='0'" class="current-bid"><div><span>{{ t('当前最高出价') }}</span><strong>{{ether(detail.bid)}} ETH</strong><small>{{shortAddress(detail.bidder)}}</small></div><button v-if="isOwner" class="button" @click="startAction('accept')">{{ t('接受出价') }}</button><button v-else-if="isBidder" class="button" @click="startAction('withdrawBid')">{{ t('撤回出价') }}</button><PhGavel v-else :size="24"/></div>
              </div>
            </section>
            <section class="recent-section"><h2>{{ t('这个角色的链上足迹') }}</h2><ActivityList :events="detail.events" @copy="copy"/></section>
          </template>
        </template>

        <template v-else-if="view==='mint'">
          <section class="mint-layout"><div class="mint-art"><div class="mint-portrait"><img :src="imageUrl(nextMintId)" :alt="`NETPUNK #${nextMintId}`" width="480" height="480"/></div><div class="mint-art-caption"><span>{{soldOut?t('COLLECTION COMPLETE'):t('NEXT IN LINE')}}</span><strong>#{{String(nextMintId).padStart(4,'0')}}</strong><p>{{ t('按编号顺序铸造，每一个都是原创。') }}</p></div></div><div class="mint-info"><span class="open-label"><PhLightning :size="15" weight="fill"/>{{soldOut?t('系列已售罄'):config.mintOpen?t('铸造已开放'):t('铸造已暂停')}}</span><h1>{{ t('一个小角色。') }}<br/>{{ t('一种新身份。') }}</h1><p>{{ t('从 24 × 24 像素开始，拥有属于你的 NETPUNK。') }}<br/>{{ t('每个地址最多铸造 5 枚，永久记录在链上。') }}</p><div class="mint-progress"><span>{{ t('已铸造') }}</span><strong>{{formatNumber(config.totalMinted)}} <small>/ 10,000</small></strong></div><div class="mint-facts"><div><span>{{ t('单枚价格') }}</span><strong>{{ether(config.mintPrice)}} ETH</strong></div><div><span>{{ t('本地址已铸造') }}</span><strong>{{wallet.minted}} / 5</strong></div></div><div class="quantity-field"><span>{{ t('铸造数量') }}</span><div class="quantity-picker"><button class="icon-button" :aria-label="t('减少数量')" :disabled="mintQuantity<=1" @click="mintQuantity--"><PhMinus :size="17"/></button><strong>{{mintQuantity}}</strong><button class="icon-button" :aria-label="t('增加数量')" :disabled="mintQuantity>=5-wallet.minted" @click="mintQuantity++"><PhPlus :size="17"/></button></div></div><div class="mint-total"><span>{{ t('合计') }}</span><strong>{{ether(String(BigInt(config.mintPrice)*BigInt(mintQuantity)))}} ETH <small>+ Gas</small></strong></div><button class="button primary mint-cta" :disabled="busy||!config.mintOpen||wallet.minted>=5||config.totalMinted>=10000||mintQuantity>5-wallet.minted" @click="perform('mint',{quantity:mintQuantity})"><PhSpinnerGap v-if="busy" class="spin" :size="19"/>{{busy?t(txStatus):soldOut?t('系列已售罄'):wallet.minted>=5?t('已达到地址铸造上限'):wallet.address?t('铸造我的 NETPUNK'):t('连接钱包并铸造')}}<PhArrowUpRight v-if="!busy" :size="19"/></button><p v-if="actionError&&!modal" class="inline-error" role="alert">{{t(actionError)}}</p><p class="mint-notice">{{ t(networkNotice) }}</p></div></section>
        </template>

        <template v-else-if="view==='activity'">
          <section class="page-intro"><h1>{{ t('每一笔，都有迹可循') }}<span>.</span></h1><p>{{ t('铸造、出价与成交，来自当前网络的真实事件记录。') }}</p></section><div class="activity-toolbar"><div class="segmented"><button v-for="[key,label] in [['all','全部动态'],['sale','成交'],['listed','上架'],['bid','出价'],['mint','铸造'],['transfer','转赠']]" :key="key" :class="{active:activityFilter===key}" @click="activityFilter=key">{{t(label)}}</button></div><button class="text-button" @click="refreshAll().catch(e=>notify(e.message))"><PhArrowClockwise :size="16"/>{{ t('刷新') }}</button></div><p v-if="listError" class="inline-error">{{t(listError)}}</p><ActivityList :events="events" @copy="copy"/>
        </template>

        <template v-else-if="view==='collection'">
          <section class="page-intro"><h1>{{ t('你的像素收藏室') }}<span>.</span></h1><p>{{ t('属于你的角色，以及尚待回应的出价。') }}</p></section>
          <div v-if="!wallet.address" class="empty-page wallet-empty"><PhWallet :size="48"/><h2>{{ t('先连接你的钱包') }}</h2><p>{{ t('连接后查看持有的 NFT、挂单与出价。') }}<br/>{{ t(isLocalNetwork?'本地体验账户无需安装插件。':'请连接浏览器钱包，并准备 Sepolia 测试 ETH。') }}</p><button class="button primary" @click="openModal('wallet')">{{ t('连接钱包') }}<PhArrowUpRight :size="18"/></button></div>
          <template v-else><div class="wallet-summary"><div><span class="wallet-avatar"><PhWallet :size="24"/></span><div><strong>{{shortAddress(wallet.address)}}</strong><button class="text-button muted" @click="copy(wallet.address)">{{ t('复制地址') }}<PhCopy :size="13"/></button></div></div><div><span>{{ t('钱包余额') }}</span><strong>{{ether(wallet.balance)}} ETH</strong></div><div><span>{{ t('可提取余额') }}</span><strong>{{ether(wallet.pending)}} ETH</strong></div><button class="button primary" :disabled="wallet.pending==='0'||busy" @click="form.action='withdraw';openModal('action')">{{ t('提取余额') }}<PhArrowUpRight :size="17"/></button></div><div class="collection-toolbar"><div class="market-tabs"><button :class="{active:collectionTab==='owned'}" @click="collectionTab='owned'">{{ t('我的 NFT') }} <span>{{wallet.owned.length}}</span></button><button :class="{active:collectionTab==='listed'}" @click="collectionTab='listed'">{{ t('我的挂单') }}</button><button :class="{active:collectionTab==='bids'}" @click="collectionTab='bids'">{{ t('我的出价') }} <span>{{wallet.bids.length}}</span></button></div><a v-if="isAdmin" href="#/admin" class="text-button">{{ t('管理发行') }}<PhArrowUpRight :size="15"/></a></div><div v-if="!collectionItems.length" class="empty-page"><PhStack :size="36"/><h2>{{collectionTab==='bids'?t('还没有活跃出价'):t('这里等着你的第一个 PUNK')}}</h2><a class="button" href="#/explore">{{ t('去探索市场') }}<PhArrowRight :size="16"/></a></div><div v-else class="punk-grid collection-grid"><PunkCard v-for="punk in collectionItems" :key="punk.id" :punk="punk" :favorite="favorites.includes(punk.id)" @favorite="toggleFavorite"/></div><div class="collection-note">{{ t('售卖收入和退回的出价会计入可提取余额，点击「提取余额」转入钱包。') }}</div></template>
        </template>

        <template v-else-if="view==='admin'">
          <section class="page-intro"><h1>{{ t('系列发行管理') }}<span>.</span></h1><p>{{ t('仅合约所有者可修改发行价格和开关。') }}</p></section><div v-if="!isAdmin" class="empty-page"><h2>{{ t('请连接发行管理员钱包') }}</h2><button class="button primary" @click="openModal('wallet')">{{ t('连接钱包') }}</button></div><div v-else class="admin-panel"><h2>{{ t('当前发行状态') }}</h2><dl><div><dt>{{ t('铸造开放') }}</dt><dd>{{config.mintOpen?t('是'):t('否')}}</dd></div><div><dt>{{ t('单枚价格') }}</dt><dd>{{ether(config.mintPrice)}} ETH</dd></div><div><dt>{{ t('铸造收入待提取') }}</dt><dd>{{ether(config.mintProceeds)}} ETH</dd></div><div><dt>{{ t('合约地址') }}</dt><dd>{{shortAddress(config.collection)}}</dd></div></dl><div class="detail-action-row"><button class="button primary" @click="form.action='settings';form.price=ether(config.mintPrice);form.open=config.mintOpen;openModal('action')">{{ t('修改发行设置') }}</button><button class="button" :disabled="config.mintProceeds==='0'" @click="form.action='mintWithdraw';openModal('action')">{{ t('提取铸造收入') }}</button></div><p>{{ t('系列上限固定为 10,000 枚，元数据基础地址在部署时确定。') }}</p></div>
        </template>
      </template>
    </main>

    <footer class="site-footer"><a class="brand footer-brand" href="#/explore">netpunks<span class="brand-period">.</span></a><span>{{ t('小小像素，各有个性。') }}</span><div><button class="text-button" @click="openModal('about')">{{ t('关于系列') }}<PhArrowUpRight :size="14"/></button><button class="text-button" @click="openModal('guide')">{{ t('使用指南') }}<PhArrowUpRight :size="14"/></button><span class="footer-chain">{{(config?.chainName || 'Hardhat Local').toUpperCase()}} / {{config?.chainId || 31337}}</span></div></footer>

    <dialog v-if="modal" ref="dialog" class="modal" :class="{'wide-modal':modal==='guide'||modal==='about'}" @cancel="busy||walletBusy?$event.preventDefault():closeModal()" @click="handleBackdrop">
      <button class="icon-button modal-close" :aria-label="t('关闭弹窗')" :disabled="busy||walletBusy" @click="closeModal"><PhX :size="21"/></button>
      <template v-if="modal==='wallet'">
        <div class="modal-symbol"><PhWallet :size="28"/></div><h2>{{wallet.address?t('你的钱包'):t('连接你的像素世界')}}</h2><p class="modal-description">{{wallet.address?t(isLocalNetwork?'管理账户，或切换本地体验身份。':'管理当前钱包账户。'):t('选择钱包，开始收藏你的第一个 NETPUNK。')}}</p>
        <div v-if="wallet.address" class="connected-wallet"><strong>{{shortAddress(wallet.address)}}</strong><span>{{ether(wallet.balance)}} ETH</span><button class="icon-button" :aria-label="t('复制钱包地址')" @click="copy(wallet.address)"><PhCopy :size="18"/></button></div>
        <button class="wallet-option" :disabled="walletBusy" @click="connect('metamask')"><span class="wallet-option-icon"><PhWallet :size="24"/></span><span><strong>{{ t('浏览器钱包') }}</strong><small>{{ t('MetaMask 或兼容的以太坊钱包') }}</small></span><PhArrowUpRight :size="19"/></button>
        <template v-if="canUseDemo()">
          <div class="modal-divider">{{ t('本地体验 · 无需安装插件') }}</div>
          <p class="demo-account-count">{{ t('{count} 个体验账户，另含 1 个发行管理员',{count:DEMO_ACCOUNTS.length}) }}</p>
          <label class="demo-account-picker"><span>{{t('选择体验账户')}}</span><select v-model.number="selectedDemoIndex" :disabled="walletBusy"><option v-for="account in DEMO_ACCOUNTS" :key="account.index" :value="account.index">{{t('体验账户 {label}',{label:account.label})}}</option></select></label>
          <button class="wallet-option" :disabled="walletBusy" @click="connect(selectedDemoIndex)"><span class="wallet-option-icon local"><PhLightning :size="22"/></span><span><strong>{{t('连接体验账户 {label}',{label:selectedDemoAccount.label})}}</strong><small>{{ t('本地测试 ETH，不涉及真实资金') }}</small></span><PhCheck v-if="wallet.mode===`demo-${selectedDemoIndex}`" :size="20"/><PhArrowRight v-else :size="18"/></button>
          <button class="wallet-option" :disabled="walletBusy" @click="connect(0)"><span class="wallet-option-icon local"><PhLightning :size="22"/></span><span><strong>{{t('发行管理员')}}</strong><small>{{ t('本地测试 ETH，不涉及真实资金') }}</small></span><PhCheck v-if="wallet.mode==='demo-0'" :size="20"/><PhArrowRight v-else :size="18"/></button>
        </template>
        <div v-if="wallet.address" class="wallet-modal-footer"><a href="#/collection" class="text-button" @click="closeModal">{{ t('查看我的收藏') }}<PhArrowRight :size="15"/></a><button class="text-button muted" @click="disconnectWallet();closeModal()"><PhSignOut :size="16"/>{{ t('断开') }}</button></div>
        <div v-if="walletBusy" class="transaction-status"><PhSpinnerGap class="spin" :size="18"/>{{ t('正在连接钱包…') }}</div>
      </template>
      <template v-else-if="modal==='action'">
        <div class="modal-symbol"><PhGavel v-if="form.action==='bid'" :size="27"/><PhWallet v-else-if="['withdraw','mintWithdraw'].includes(form.action)" :size="27"/><PhArrowUpRight v-else :size="27"/></div>
        <h2>{{({list:t('上架你的 NETPUNK'),buy:t('确认购买'),bid:t('为这个角色出价'),accept:t('接受当前出价'),cancel:t('取消出售'),transfer:t('赠送这个角色'),withdrawBid:t('撤回当前出价'),withdraw:t('提取可用余额'),settings:t('修改发行设置'),mintWithdraw:t('提取铸造收入')})[form.action]}}</h2>
        <div v-if="actionPunk&& !['withdraw','settings','mintWithdraw'].includes(form.action)" class="action-asset"><img :src="imageUrl(actionPunk.id)" :alt="`NETPUNK #${actionPunk.id}`" width="64" height="64"/><div><strong>NETPUNK #{{String(actionPunk.id).padStart(4,'0')}}</strong><span>{{t(actionPunk.traits.type)}} / {{t(actionPunk.traits.hair)}}</span></div></div>
        <form @submit.prevent="submitAction">
          <label v-if="['list','bid','settings'].includes(form.action)" class="form-label">{{form.action==='bid'?t('你的出价'):form.action==='settings'?t('单枚铸造价格'):t('出售价格')}} (ETH)<input v-model="form.price" type="text" inputmode="decimal" pattern="[0-9]+(\.[0-9]{1,18})?" placeholder="0.01" required :disabled="busy"/></label>
          <p v-if="form.action==='bid'" class="form-help">{{ t('当前最高出价') }} {{ether(actionPunk.bid)}} {{ t('ETH。新出价将全额存入合约；撤回或被超价后，资金进入可提取余额。') }}</p>
          <label v-if="form.action==='list'" class="form-label">{{ t('指定买家地址（可选）') }}<input v-model="form.onlyBuyer" :placeholder="t('留空则所有人均可购买')" :disabled="busy"/></label>
          <label v-if="form.action==='transfer'" class="form-label">{{ t('接收钱包地址') }}<input v-model="form.to" placeholder="0x…" required :disabled="busy"/></label>
          <label v-if="form.action==='settings'" class="checkbox-row setting-checkbox"><input type="checkbox" v-model="form.open" :disabled="busy"/>{{ t('开放铸造') }}</label>
          <div v-if="form.action==='buy'" class="confirmation-total"><span>{{ t('购买金额') }}</span><strong>{{ether(actionPunk.price)}} ETH</strong></div>
          <div v-if="form.action==='accept'" class="confirmation-total"><span>{{ t('将收到') }}</span><strong>{{ether(actionPunk.bid)}} ETH</strong></div>
          <div v-if="form.action==='withdraw'" class="confirmation-total"><span>{{ t('提取到当前钱包') }}</span><strong>{{ether(wallet.pending)}} ETH</strong></div>
          <div v-if="form.action==='mintWithdraw'" class="confirmation-total"><span>{{ t('提取到管理员钱包') }}</span><strong>{{ether(config.mintProceeds)}} ETH</strong></div>
          <p v-if="form.action==='transfer'" class="form-help">{{ t('确认地址后，这枚 NFT 将直接转到接收钱包。') }}</p>
          <p v-if="['cancel','withdrawBid'].includes(form.action)" class="form-help">{{form.action==='cancel'?t('取消后，其他用户将无法通过当前挂单购买。'):t('撤回后，出价金额计入可提取余额，可在「我的收藏」中提取。')}}</p>
          <p v-if="form.action==='accept'" class="form-help">{{ t('NFT 将转给出价者，收入计入你的可提取余额。') }}</p>
          <button class="button primary modal-submit" :disabled="busy"><PhSpinnerGap v-if="busy" class="spin" :size="18"/>{{busy?t(txStatus):wallet.address?t('确认并提交交易'):t('连接钱包')}}<PhArrowUpRight v-if="!busy" :size="18"/></button>
        </form>
      </template>
      <template v-else-if="modal==='about'">
        <div class="about-mini-art"><img v-for="id in [3,12,23,30]" :key="id" :src="imageUrl(id)" :alt="`NETPUNK #${id}`" width="80" height="80"/></div><h2>{{ t('小小像素，各有个性。') }}</h2><p class="modal-description">{{ t('NETPUNKS 是一组 10,000 枚原创生成像素头像，借鉴早期像素收藏品的简洁表达，使用独立的名称、素材和合约。') }}</p><div class="about-facts"><div><strong>24 × 24</strong><span>{{ t('像素画布') }}</span></div><div><strong>10,000</strong><span>{{ t('固定发行上限') }}</span></div><div><strong>0%</strong><span>{{ t('市场手续费') }}</span></div></div><p class="form-help">{{ t('每枚 NFT 有独立编号、类型、发型和眼部配饰。所有权、挂单和资金由智能合约管理，网站同步链上事件用于查询。') }}</p><div class="avatar-about-explanation"><strong>{{t('为什么每次铸造的头像不一样？')}}</strong><p class="form-help">{{t('每次铸造会获得新的 NFT 编号。头像按编号组合发型、配饰和颜色；在生成代码和素材不变时，同一编号的头像始终一致，刷新页面或转赠都不会改变外观。')}}</p></div><p class="local-notice">{{ t(isLocalNetwork?'当前为本地开发版本。48 枚初始 NFT 及市场活动由本地测试交易生成，数据不代表公开市场行情。':'当前运行于 Sepolia 测试网，资产和交易使用测试 ETH。') }}</p><a href="#/mint" class="button primary modal-submit" @click="closeModal">{{ t('铸造一个属于你的角色') }}<PhArrowUpRight :size="18"/></a>
      </template>
      <template v-else-if="modal==='guide'">
        <div class="modal-symbol"><PhBookOpen :size="27"/></div><h2>{{ t('从一个像素角色开始') }}</h2><div class="guide-items"><div><strong>{{ t('连接钱包') }}</strong><p>{{ t(isLocalNetwork?'使用浏览器钱包，或选择本地体验账户 A–S。体验账户自带测试 ETH。':'连接 MetaMask 或兼容钱包，切换至 Sepolia，并为钱包准备 Sepolia 测试 ETH。') }}</p></div><div><strong>{{ t('铸造或购买') }}</strong><p>{{ t('在铸造页领取下一编号的角色；也可以在市场打开喜欢的 NFT，按售价购买。') }}</p></div><div><strong>{{ t('出售或提出出价') }}</strong><p>{{ t('在自己的 NFT 详情页上架；首次交易会请求授权这一枚 NFT。对其他角色可提出资金托管出价。') }}</p></div><div><strong>{{ t('管理与提款') }}</strong><p>{{ t('在「我的收藏」管理资产。成交收入、被超价或撤回的出价进入可提取余额，再由你主动提取到钱包。') }}</p></div></div><p class="local-notice">{{ t(isLocalNetwork?'交易确认后自动刷新。重启一键开发服务会重新部署本地链并重置测试数据。交易详情按钮会复制交易哈希。':'交易确认后自动刷新。重启网站不会重置 Sepolia 链上资产。交易详情按钮会复制交易哈希。') }}</p>
      </template>
      <div v-if="actionError" class="inline-error" role="alert"><PhWarningCircle :size="17"/>{{t(actionError)}}</div>
    </dialog>
    <Transition name="toast"><div v-if="toast" class="toast-message" role="status"><PhCheckCircle :size="19"/>{{t(toast)}}</div></Transition>
  </div>
</template>

<script>
import { PhSparkle } from '@phosphor-icons/vue';
export default {components:{PhSparkleIcon:PhSparkle}};
</script>
