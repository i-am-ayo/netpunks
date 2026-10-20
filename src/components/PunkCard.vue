<script setup>
import {t} from '../lib/i18n';
import { computed } from 'vue';
import { PhArrowUpRight, PhHeart, PhGavel } from '@phosphor-icons/vue';
import { ether,imageUrl } from '../lib/api';
const props=defineProps({punk:Object,favorite:Boolean});
const emit=defineEmits(['favorite']);
const hasPrice=computed(()=>props.punk.price!=='0');
</script>

<template>
  <article class="punk-card">
    <a :href="`#/punk/${punk.id}`" class="punk-art" :aria-label="t('查看 NETPUNK #{id}',{id:punk.id})">
      <img :src="imageUrl(punk.id)" :alt="`NETPUNK #${punk.id}, ${t(punk.traits.type)}, ${t(punk.traits.hair)}`" width="480" height="480" loading="lazy" />
      <span class="card-arrow"><PhArrowUpRight :size="21" /></span>
    </a>
    <div class="card-title-row">
      <a :href="`#/punk/${punk.id}`" class="punk-name">NETPUNK <span>#{{ String(punk.id).padStart(4,'0') }}</span></a>
      <button class="icon-button heart-button" :class="{saved:favorite}" :aria-label="favorite?t('取消收藏'):t('收藏 NFT')" :aria-pressed="favorite" @click="emit('favorite',punk.id)"><PhHeart :size="19" :weight="favorite?'fill':'regular'" /></button>
    </div>
    <div class="card-traits">{{ t(punk.traits.type) }} <span>/</span> {{ t(punk.traits.hair) }}</div>
    <div class="card-price-row">
      <div><span class="small-label">{{ hasPrice?t('售价'):t('当前状态') }}</span><strong v-if="hasPrice">{{ ether(punk.price) }} <span>ETH</span></strong><strong v-else class="not-listed">{{ t('未上架') }}</strong></div>
      <span v-if="punk.bid!=='0'" class="bid-chip" :title="t('有活跃出价')"><PhGavel :size="13" /> {{ ether(punk.bid) }}</span>
      <span v-else-if="hasPrice" class="sale-chip">{{ t('可购买') }}</span>
    </div>
  </article>
</template>
