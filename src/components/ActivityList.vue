<script setup>
import {t,locale} from '../lib/i18n';
import { PhArrowUpRight, PhArrowsLeftRight, PhTag, PhGavel, PhSparkle } from '@phosphor-icons/vue';
import { ether,imageUrl,relativeTime,eventLabels,shortAddress } from '../lib/api';
defineProps({events:Array,compact:Boolean});
const icons={mint:PhSparkle,transfer:PhArrowsLeftRight,listed:PhTag,bid:PhGavel,sale:PhArrowsLeftRight};
</script>
<template>
  <div class="activity-list" :class="{compact}">
    <div v-if="!events?.length" class="empty-state">{{ t('暂时没有符合条件的链上记录。') }}</div>
    <div v-for="event in events" :key="event.key" class="activity-row">
      <a v-if="event.tokenId!==null" :href="`#/punk/${event.tokenId}`" class="activity-thumb"><img :src="imageUrl(event.tokenId)" :alt="`NETPUNK #${event.tokenId}`" width="44" height="44" loading="lazy" /></a>
      <span v-else class="activity-thumb no-thumb"><PhArrowsLeftRight :size="20" /></span>
      <div class="activity-asset"><a v-if="event.tokenId!==null" :href="`#/punk/${event.tokenId}`">NETPUNK #{{ String(event.tokenId).padStart(4,'0') }}</a><strong v-else>{{ t('钱包提款') }}</strong><span>{{ shortAddress(event.actor) }}</span></div>
      <span class="activity-kind" :class="event.kind"><component :is="icons[event.kind] || PhArrowsLeftRight" :size="15" />{{ t(eventLabels[event.kind] || event.kind) }}</span>
      <strong class="activity-value">{{ event.amount!=='0' ? `${ether(event.amount)} ETH` : t('无付款') }}</strong>
      <span class="activity-time" :title="new Date(event.timestamp*1000).toLocaleString(locale)">{{ relativeTime(event.timestamp) }}</span>
      <button class="icon-button tx-copy" :aria-label="t('复制交易哈希 {hash}',{hash:event.hash})" @click="$emit('copy',event.hash)"><PhArrowUpRight :size="17" /></button>
    </div>
  </div>
</template>
