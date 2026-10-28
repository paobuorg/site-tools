export type ChecklistRaceType = 'road' | 'trail';
export type ChecklistDuration = 'under-3h' | '3-6h' | 'over-6h';
export type ChecklistWeather = 'mild' | 'hot' | 'cold' | 'rain';
export type ChecklistLocale = 'zh-CN' | 'en';

export interface ChecklistOptions {
  raceType: ChecklistRaceType;
  duration: ChecklistDuration;
  weather: ChecklistWeather;
  travel: boolean;
}

export interface ChecklistItem {
  id: string;
  label: Record<ChecklistLocale, string>;
  detail?: Record<ChecklistLocale, string>;
}

export interface ChecklistSection {
  id: string;
  title: Record<ChecklistLocale, string>;
  items: ChecklistItem[];
}

const item = (
  id: string,
  zh: string,
  en: string,
  detailZh?: string,
  detailEn?: string,
): ChecklistItem => ({
  id,
  label: { 'zh-CN': zh, en },
  ...(detailZh || detailEn ? { detail: { 'zh-CN': detailZh ?? en, en: detailEn ?? zh } } : {}),
});

export function buildChecklist(options: ChecklistOptions): ChecklistSection[] {
  const sections: ChecklistSection[] = [
    {
      id: 'entry',
      title: { 'zh-CN': '参赛与身份', en: 'Entry and identity' },
      items: [
        item('bib', '号码布与固定扣', 'Bib and fasteners'),
        item('id', '身份证件或赛事要求的证明', 'Identification or proof required by the race'),
        item('registration', '报名确认、接驳/入场信息', 'Registration confirmation and transport/entry details'),
        item('emergency-contact', '紧急联系人信息', 'Emergency contact details'),
      ],
    },
    {
      id: 'clothing',
      title: { 'zh-CN': '衣物与鞋', en: 'Clothing and shoes' },
      items: [
        item('shoes', '已测试的比赛鞋', 'Race shoes tested in training'),
        item('socks', '防磨、已测试的袜子', 'Tested blister-resistant socks'),
        item('layers', '按天气准备的分层衣物', 'Layers matched to the forecast'),
        item('anti-chafe', '防磨膏或贴布', 'Anti-chafe balm or tape'),
      ],
    },
    {
      id: 'fuel',
      title: { 'zh-CN': '补给与水', en: 'Fuel and water' },
      items: [
        item('carbs', '已测试的碳水补给', 'Tested carbohydrate sources'),
        item('bottle', '水壶或软水袋', 'Bottle or soft flask'),
        item('electrolytes', '按条件准备的电解质', 'Electrolytes matched to conditions'),
        item('aid-plan', '补给点与携带量计划', 'Aid-station and carry plan'),
      ],
    },
    {
      id: 'logistics',
      title: { 'zh-CN': '交通与赛后', en: 'Travel and finish' },
      items: [
        item('arrival', '到场时间与交通路线', 'Arrival time and route'),
        item('bag', '存包与赛后干衣', 'Drop bag and dry clothes'),
        item('return', '返程与住宿安排', 'Return travel and accommodation'),
        item('phone', '手机与充电方案', 'Phone and charging plan'),
      ],
    },
  ];

  if (options.weather === 'hot') {
    sections.push({
      id: 'heat',
      title: { 'zh-CN': '高温与高湿', en: 'Heat and humidity' },
      items: [
        item('cooling', '冰袋、湿毛巾或遮阳帽', 'Ice, wet towel or sun hat'),
        item('heat-plan', '降温点、补给点和撤退计划', 'Cooling points, aid stations and withdrawal plan'),
        item('heat-salt', '已测试的电解质方案', 'Tested electrolyte plan'),
        item('heat-warning', '热病停止信号', 'Heat-illness stop signals', '头晕、恶心、意识混乱或晕厥时停止并求助。', 'Stop and seek help for dizziness, nausea, confusion or fainting.'),
      ],
    });
  }

  if (options.weather === 'cold' || options.weather === 'rain') {
    sections.push({
      id: 'cold-wet',
      title: { 'zh-CN': '寒冷与雨湿', en: 'Cold and wet' },
      items: [
        item('shell', '防风防水外层', 'Wind- and water-resistant shell'),
        item('gloves', '手套与保暖帽', 'Gloves and warm hat'),
        item('dry-bag', '手机和干衣防水袋', 'Dry bag for phone and spare clothes'),
        item('cold-exit', '失温信号与撤离计划', 'Hypothermia signals and exit plan'),
      ],
    });
  }

  if (options.raceType === 'trail') {
    sections.push({
      id: 'trail',
      title: { 'zh-CN': '越野与导航', en: 'Trail and navigation' },
      items: [
        item('headlamp', '头灯与备用电池', 'Headlamp and spare batteries'),
        item('map', '地图/指北针或离线导航', 'Map/compass or offline navigation'),
        item('whistle', '哨子与急救包', 'Whistle and first-aid kit'),
        item('shelter', '求生毯或轻量庇护', 'Emergency blanket or light shelter'),
        item('trail-plan', '撤离点与预计返程时间', 'Escape points and expected return time'),
      ],
    });
  }

  if (options.duration === 'over-6h') {
    sections.push({
      id: 'long-race',
      title: { 'zh-CN': '长距离额外检查', en: 'Long-race extras' },
      items: [
        item('spare-battery', '头灯/手表备用电源', 'Spare power for headlamp or watch'),
        item('extra-food', '比计划多一份食物', 'One extra portion of food'),
        item('foot-care', '足部护理与备用袜', 'Foot care and spare socks'),
        item('crew-plan', '支援/换装计划', 'Crew or drop-bag plan'),
      ],
    });
  }

  if (options.travel) {
    sections.push({
      id: 'travel',
      title: { 'zh-CN': '异地参赛', en: 'Travelling to race' },
      items: [
        item('travel-kit', '比赛装备放在随身行李', 'Race kit in carry-on luggage'),
        item('medication', '个人药物与处方', 'Personal medication and prescription'),
        item('time-zone', '睡眠与到达时间安排', 'Sleep and arrival plan'),
        item('local-rules', '当地交通、天气与赛事规则', 'Local transport, weather and race rules'),
      ],
    });
  }

  return sections;
}
