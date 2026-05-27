import path from 'path';
import { prefetchMetrics } from './src/ai-helper/metrics.js';
import { renderPptDeckFromSpecs } from './src/ai-helper/pptSpecRenderer.js';
import { AI_HELPER_ROOT } from './src/ai-helper/paths.js';

type Obj = Record<string, any>;
function fmtInt(v:any){const n=Number(v||0); return Number.isFinite(n)?Math.round(n).toLocaleString('zh-CN'):'0'}
function pct(v:any){const n=Number(v||0); return Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'0.0%'}
function rate(a:any,b:any){const x=Number(a||0), y=Number(b||0); return y?x/y:0}
function metric(label:string,value:any,unit='',note='',status='neutral',delta?:string){return {label,value,unit,note,status,delta}}
function notes(s:string){return s.slice(0,60)}

const m = await prefetchMetrics();
const k:any = m.coreKpi;
const monthly = (m.monthlyTrend||[]).slice(-6) as Obj[];
const topContent = (m.topContent||[]).slice(0,5) as Obj[];
const projects = (m.projects||[]).filter((p:any)=>Number(p.readCount||0)>0||Number(p.pushCount||0)>0||Number(p.contentCount||0)>0).slice(0,4) as Obj[];
const topItem = topContent[0];
const topProject = projects[0];
const deliveryRate = rate(k.deliveredCount,k.pushCount);
const readConversion = rate(k.readUsers,k.deliveredCount);
const interactionRate = rate(k.interactionCount,k.readCount);
const top3Read = topContent.slice(0,3).reduce((sum,item)=>sum+Number(item.readCount||0),0);
const top3Share = rate(top3Read,k.readCount);
const bestFinish = [...topContent].filter(x=>Number(x.readCount||0)>0).sort((a,b)=>Number(b.finishRate||0)-Number(a.finishRate||0))[0];
const lowFinish = [...topContent].filter(x=>Number(x.readCount||0)>0).sort((a,b)=>Number(a.finishRate||0)-Number(b.finishRate||0))[0];
const rangeText = `${m.range.start} 至 ${m.range.end}`;
const trendCategories = monthly.map(x=>String(x.month||'').replace(/^2026-/,''));
const trendValues = monthly.map(x=>Number(x.readCount||0));
const rankingItems = topContent.map(i=>({label:String(i.title||'未命名内容'),value:Number(i.readCount||0),note:`完读率 ${pct(i.finishRate)}`}));
const projectItems = projects.map(i=>({label:String(i.name||'未命名项目'),value:Number(i.readCount||0),note:`互动 ${fmtInt(i.interactionCount)}`}));
const kpiTable = [
  { 指标: '推送量', 数值: fmtInt(k.pushCount), 口径: '内容触达入口', 判断: '规模基础' },
  { 指标: '送达量', 数值: fmtInt(k.deliveredCount), 口径: `送达率 ${pct(deliveryRate)}`, 判断: '触达稳定' },
  { 指标: '阅读用户', 数值: fmtInt(k.readUsers), 口径: `送达后阅读 ${pct(readConversion)}`, 判断: '转化空间' },
  { 指标: '阅读次数', 数值: fmtInt(k.readCount), 口径: '内容消费规模', 判断: '核心结果' },
  { 指标: '互动次数', 数值: fmtInt(k.interactionCount), 口径: `互动/阅读 ${pct(interactionRate)}`, 判断: '深度转化' },
  { 指标: '完读率', 数值: pct(k.finishRate), 口径: `平均 ${Number(k.avgReadSec||0).toFixed(0)} 秒`, 判断: '质量基线' },
];
const monthlyTable = monthly.slice(-4).map(i=>({月份:String(i.month||''), 阅读:fmtInt(i.readCount), 互动:fmtInt(i.interactionCount), 推送:fmtInt(i.pushCount), 阅读用户:fmtInt(i.readUsers)}));
const contentTable = topContent.slice(0,5).map((i,idx)=>({排名:idx+1, 内容:String(i.title||'').slice(0,18), 阅读:fmtInt(i.readCount), 互动:fmtInt(i.interactionCount), 完读率:pct(i.finishRate)}));
const projectTable = projects.slice(0,4).map(i=>({项目:String(i.name||'').slice(0,16), 疾病:String(i.disease||''), 内容:fmtInt(i.contentCount), 阅读:fmtInt(i.readCount), 互动:fmtInt(i.interactionCount)}));
const diagnosisTable = [
  { 问题: '头部集中', 数据证据: `TOP3 内容占比 ${pct(top3Share)}`, 原因判断: '高表现主题可复制但依赖度高', 动作: '沉淀模板并扩展相邻主题' },
  { 问题: '低完读内容', 数据证据: lowFinish ? `${String(lowFinish.title||'').slice(0,12)} ${pct(lowFinish.finishRate)}` : '暂无低完读样本', 原因判断: '场景切入与结构分层不足', 动作: '改成清单、图解和步骤化表达' },
  { 问题: '互动转化', 数据证据: `互动/阅读 ${pct(interactionRate)}`, 原因判断: '阅读后行动引导仍可加强', 动作: '增加问答、收藏和提醒 CTA' },
  { 问题: '项目组合', 数据证据: topProject ? `头部项目阅读 ${fmtInt(topProject.readCount)}` : '项目数据不足', 原因判断: '慢病项目是基本盘，长尾需补强', 动作: '补齐肿瘤随访等连续主题' },
];
const actionItems = ['模板沉淀：将实操指南、问答卡、红旗信号图解纳入内容 SOP','质量优化：低完读内容重构为场景清单、图解步骤和明确行动提示','触达策略：按活跃时段与项目人群分层推送，跟踪阅读到互动转化','项目组合：巩固糖尿病和高血压基本盘，同时补强肿瘤随访连续主题'];
const actionTable = [
  { 优先级: 'P0', 动作: '沉淀爆款模板', 负责人: '内容运营', 衡量指标: 'TOP 内容复用数、完读率' },
  { 优先级: 'P0', 动作: '低完读内容改版', 负责人: '编辑与医学审核', 衡量指标: '完读率、平均阅读时长' },
  { 优先级: 'P1', 动作: '分层推送实验', 负责人: '运营策略', 衡量指标: '送达后阅读、互动/阅读' },
  { 优先级: 'P1', 动作: '补强病种矩阵', 负责人: '项目负责人', 衡量指标: '项目阅读占比、互动次数' },
];
const deck:any = {
 title:'患教运营数据阶段性汇报', subtitle:`最近一年｜${rangeText}`, theme:'executive_blue',
 design_tokens:{background:'soft_blobs',card_style:'glass',chart_style:'bold',density:'medium',icon_style:'circle',accent_shape:'orbit',number_style:'hero',accent_color:'#2563EB',panel_alt_fill:'#EEF6FF',corner_radius:20,gap:18},
 data_display:{number_format:'compact_cn',show_axis:true,show_grid:true,show_value_labels:true,show_legend:true,highlight_max:true},
 slides:[
  {slide_no:1,slide_type:'cover',visual_intent:'growth_story',layout_variant:'statement_cover',title:'患教运营数据阶段性汇报',subtitle:rangeText,takeaway:`累计阅读 ${fmtInt(k.readCount)} 次，互动 ${fmtInt(k.interactionCount)} 次，完读率 ${pct(k.finishRate)}`,emphasis:'hero_metric',bullets:[`覆盖 ${fmtInt(k.projectCount)} 个项目、${fmtInt(k.contentCount)} 篇内容、${fmtInt(k.activeDays)} 个活跃日`,`最近 30 天阅读 ${fmtInt(k.readCount)} 次，互动 ${fmtInt(k.interactionCount)} 次`,topItem?`头部内容「${topItem.title}」是当前可复用样本`:'聚焦阅读、互动、完读和项目贡献的复盘闭环'],metrics:[metric('阅读次数',k.readCount,'次','累计内容消费规模','good'),metric('互动次数',k.interactionCount,'次','互动深度表现','neutral'),metric('完读率',pct(k.finishRate),'','内容质量指标','good')],components:[{type:'hero_metric',title:'阅读规模',value:fmtInt(k.readCount),unit:'次',note:`互动 ${fmtInt(k.interactionCount)} 次`,tone:'good'},{type:'metric_card',title:'完读率',value:pct(k.finishRate),note:`平均阅读 ${Number(k.avgReadSec||0).toFixed(0)} 秒`,tone:'good'},{type:'callout',title:'汇报目标',text:'用核心数据判断运营表现、内容机会和下一步动作。',tone:'neutral'}],notes:notes('本页说明报告周期、核心指标和汇报目标，帮助业务团队快速建立全局判断。')},
  {slide_no:2,slide_type:'executive_summary',visual_intent:'executive_summary',layout_variant:'hero_metric',title:'核心结论',subtitle:'规模增长、质量稳定、头部内容可复制',takeaway:`阅读 ${fmtInt(k.readCount)} 次，互动 ${fmtInt(k.interactionCount)} 次，内容质量基线稳定`,emphasis:'insight',bullets:[`送达率 ${pct(deliveryRate)}，送达后阅读转化 ${pct(readConversion)}`,`互动/阅读 ${pct(interactionRate)}，可继续强化行动引导`,topItem?`头部内容「${topItem.title}」贡献最高阅读`:'头部内容贡献仍需继续观察'],metrics:[metric('阅读次数',k.readCount,'次','消费规模','good'),metric('互动次数',k.interactionCount,'次','互动深度','good'),metric('送达后阅读',pct(readConversion),'','阅读用户/送达量','neutral'),metric('互动/阅读',pct(interactionRate),'','互动转化效率','neutral')],components:[{type:'matrix',title:'核心判断表',table:[{维度:'规模',数据:`阅读 ${fmtInt(k.readCount)} 次`,结论:'内容消费已形成基本盘'},{维度:'转化',数据:`送达后阅读 ${pct(readConversion)}`,结论:'人群分层仍有提升空间'},{维度:'质量',数据:`完读率 ${pct(k.finishRate)}`,结论:'质量基线稳定'},{维度:'内容',数据:topItem?`TOP 内容 ${fmtInt(topItem.readCount)} 次`:'暂无头部样本',结论:'可沉淀选题模板'}],tone:'neutral'},{type:'action_card',title:'运营抓手',text:'复制头部内容结构，提升低完读内容的场景切入和行动指引。',tone:'good'},{type:'risk_card',title:'关注风险',text:'如果持续依赖少数慢病项目，需要补足长尾病种内容连续性。',tone:'warn'}],notes:notes('本页先给出整体判断，强调增长、质量和优化抓手。')},
  {slide_no:3,slide_type:'kpi_dashboard',visual_intent:'growth_story',layout_variant:'dashboard',title:'关键指标',subtitle:'触达、阅读、互动和质量四类指标',takeaway:`累计推送 ${fmtInt(k.pushCount)} 次，带来 ${fmtInt(k.readCount)} 次阅读`,emphasis:'hero_metric',bullets:[`送达率 ${pct(deliveryRate)}，说明触达基础稳定`,`送达后阅读转化 ${pct(readConversion)}，仍有分层推送优化空间`,`互动/阅读 ${pct(interactionRate)}，需要通过 CTA 与问答机制继续放大`],metrics:[metric('推送量',k.pushCount,'次','触达规模','neutral'),metric('送达量',k.deliveredCount,'次',`送达率 ${pct(deliveryRate)}`,'good'),metric('阅读次数',k.readCount,'次','消费规模','good'),metric('阅读用户',k.readUsers,'人',`阅读转化 ${pct(readConversion)}`,'good'),metric('互动次数',k.interactionCount,'次',`互动率 ${pct(interactionRate)}`,'neutral'),metric('平均阅读',Number(k.avgReadSec||0).toFixed(0),'秒','内容停留','neutral')],components:[{type:'matrix',title:'核心 KPI 明细表',table:kpiTable,tone:'neutral'},{type:'funnel_panel',title:'触达转化漏斗',metrics:[metric('推送',k.pushCount,'次','触达入口'),metric('送达',k.deliveredCount,'次',pct(deliveryRate)),metric('阅读用户',k.readUsers,'人',pct(readConversion)),metric('互动',k.interactionCount,'次',pct(interactionRate))]},{type:'insight_card',title:'指标解读',text:'规模指标已形成基本盘，后续重点是阅读到互动的深度转化。',tone:'neutral'}],notes:notes('本页用四类 KPI 建立仪表盘，重点关注阅读规模和阅读质量是否同步提升。')},
  {slide_no:4,slide_type:'trend',visual_intent:'growth_story',layout_variant:'chart_plus_insights',title:'阅读与互动趋势',subtitle:'按月观察运营节奏变化',takeaway:monthly.length?`${monthly.at(-1)?.month}阅读 ${fmtInt(monthly.at(-1)?.readCount)} 次`:'近期阅读与互动保持活跃',emphasis:'chart',bullets:['3 月到 5 月阅读规模快速放大，说明触达和内容供给共同拉动','互动量随阅读同步上升，内容不仅被打开，也能承接后续动作','5 月阅读继续增长，应关注推送频次与用户疲劳之间的平衡'],metrics:[metric('最近 30 天阅读',k.readCount,'次','短周期表现','good'),metric('最近 30 天互动',k.interactionCount,'次','短周期互动','neutral')],chart:{type:'area',title:'月度阅读与互动趋势',categories:trendCategories,series:[{name:'阅读次数',values:trendValues},{name:'互动次数',values:monthly.map(i=>Number(i.interactionCount||0))}],value_suffix:'次'},components:[{type:'chart_panel',title:'月度阅读与互动趋势',chart:{type:'area',categories:trendCategories,series:[{name:'阅读次数',values:trendValues},{name:'互动次数',values:monthly.map(i=>Number(i.interactionCount||0))}]}},{type:'matrix',title:'月度数据表',table:monthlyTable,tone:'neutral'},{type:'insight_card',title:'趋势判断',text:'阅读与互动同步抬升，说明内容主题与用户需求匹配；后续需控制触达疲劳。',tone:'good'}],notes:notes('本页从月度趋势看节奏，说明阅读规模增长后仍要跟踪互动和完读质量。')},
  {slide_no:5,slide_type:'comparison',visual_intent:'comparison',layout_variant:'split_chart',title:'内容与项目表现',subtitle:'识别可复制内容和主力项目',takeaway:topProject?`主力项目「${topProject.name}」贡献阅读 ${fmtInt(topProject.readCount)} 次`:'内容与项目贡献需要持续积累',emphasis:'ranking',bullets:[topProject?`头部项目贡献阅读 ${fmtInt(topProject.readCount)} 次，慢病随访是当前基本盘`:'项目贡献仍需继续积累',topItem?`头部内容「${topItem.title}」完读率 ${pct(topItem.finishRate)}`:'头部内容样本仍需继续沉淀',`TOP3 内容贡献 ${pct(top3Share)} 阅读，适合沉淀选题模板`],metrics:[metric('TOP 内容数',topContent.length,'篇','参与本页排名','neutral'),metric('活跃项目数',projects.length,'个','有阅读或推送项目','neutral'),metric('TOP3 内容占比',pct(top3Share),'','阅读集中度','neutral')],chart:{type:'ranking',title:'内容阅读 TOP5',items:rankingItems},components:[{type:'matrix',title:'内容 TOP5 明细表',table:contentTable,tone:'neutral'},{type:'matrix',title:'项目贡献表',table:projectTable,tone:'neutral'},{type:'insight_card',title:'内容方法',items:[topItem?`标杆：${topItem.title}，阅读 ${fmtInt(topItem.readCount)}`:'',bestFinish?`高完读：${bestFinish.title}，完读率 ${pct(bestFinish.finishRate)}`:'',lowFinish?`待优化：${lowFinish.title}，完读率 ${pct(lowFinish.finishRate)}`:''].filter(Boolean),tone:'good'}],notes:notes('本页比较内容和项目贡献，重点识别可复制主题和需要进一步优化的内容类型。')},
  {slide_no:6,slide_type:'diagnosis',visual_intent:'diagnosis',layout_variant:'risk_matrix',title:'问题诊断与机会判断',subtitle:'把数据证据转成可执行的优化方向',takeaway:'当前不是单一数据异常，而是内容集中度、低完读样本和互动转化的结构优化问题',emphasis:'balanced',bullets:[`TOP3 内容贡献 ${pct(top3Share)} 阅读，说明方法可复制但集中度需要控制`,lowFinish?`低完读样本「${String(lowFinish.title||'').slice(0,18)}」完读率 ${pct(lowFinish.finishRate)}`:'低完读样本需要持续监控',`互动/阅读 ${pct(interactionRate)}，后续要用 CTA 与服务承接提升行动转化`],metrics:[metric('TOP3 内容占比',pct(top3Share),'','阅读集中度','neutral'),metric('最低完读率',lowFinish?pct(lowFinish.finishRate):'暂无','','优化样本','warn'),metric('互动/阅读',pct(interactionRate),'','深度转化','neutral')],components:[{type:'matrix',title:'诊断表',table:diagnosisTable,tone:'warn'},{type:'risk_card',title:'核心风险',text:'如果只放大推送量而不优化内容结构，阅读增长可能无法稳定转化为互动和长期留存。',tone:'warn'},{type:'action_card',title:'优先机会',text:'从头部内容中提炼标题、结构、图解和行动指引模板，优先复制到相邻疾病场景。',tone:'good'}],notes:notes('本页把表现数据转成问题诊断，明确后续优先优化方向。')},
  {slide_no:7,slide_type:'closing',visual_intent:'action_plan',layout_variant:'timeline',title:'下一步行动建议',subtitle:'围绕内容复制、质量优化和项目拓展推进',takeaway:'沉淀高表现内容模板，优化低完读内容，强化分层触达和互动引导',emphasis:'timeline',bullets:actionItems,metrics:[metric('优先模板',topItem?topItem.title:'高阅读内容','','作为复盘样本','good'),metric('优化方向','完读率与互动率','','质量提升重点','neutral')],components:[{type:'matrix',title:'行动计划表',table:actionTable,tone:'good'},{type:'timeline',title:'推进节奏',items:actionItems,tone:'good'},{type:'takeaway_band',title:'目标',text:'从规模增长转向内容资产沉淀与精细化转化。',tone:'good'}],notes:notes('本页收束为三类行动：复制模板、优化质量、按人群和项目提升转化。')},
 ]
};
const ts = new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
const projectRel = `projects/fast_template_table_preview_${ts}`;
const projectRoot = path.join(AI_HELPER_ROOT, projectRel);
const rendered = await renderPptDeckFromSpecs(projectRoot, projectRel, deck);
console.log(JSON.stringify({ok:true, project:`/${projectRel}`, files:rendered.files, svg_count:rendered.svg_count}, null, 2));
