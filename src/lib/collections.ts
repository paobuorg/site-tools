export type ToolCollection = {
  slug: string;
  icon: string;
  zh: { title: string; summary: string; intro: string; notes: string[] };
  en: { title: string; summary: string; intro: string; notes: string[] };
  tools: string[];
};

export const TOOL_COLLECTIONS: ToolCollection[] = [
  {
    slug: 'race-planning',
    icon: 'calendar',
    zh: { title: '比赛规划', summary: '从资格核对到发枪时间线，把比赛拆成可执行节点。', intro: '这一组处理“能不能报、当天怎么走、什么时候该慢”。每个工具都需要你输入官方关门表或目标成绩，输出只是可核对的中间量。', notes: ['先确认资格与关门表，再排时间线；顺序反了会得到漂亮但无效的计划。', '所有时间线都留缓冲，官方关门表不替你承担交通与排队。', '结果不构成报名或完赛保证。'] },
    en: { title: 'Race planning', summary: 'From eligibility to gun-time timeline, turn a race into executable nodes.', intro: 'This group covers whether you can enter, how race day unfolds and when to slow down. Every tool asks for an official cut-off table or a target time; the output is only a checkable intermediate value.', notes: ['Confirm eligibility and cut-offs before building a timeline; reversing the order gives a neat but invalid plan.', 'Keep buffers in every timeline; an official cut-off table does not absorb transport or queues.', 'Results are not an entry or finish guarantee.'] },
    tools: ['race-qualifier-checker', 'cutoff-planner', 'race-day-timeline', 'race-checklist', 'crew-pacer-plan', 'taper-planner'],
  },
  {
    slug: 'pace-and-results',
    icon: 'chart',
    zh: { title: '配速与成绩', summary: '配速、坡度、热、分段与赛后复盘。', intro: '同一目标成绩在不同坡度与气温下不是同一个配速。这里把换算、预测与复盘放在一起，避免拿一个公式跑遍所有条件。', notes: ['先确定输入是 gun time 还是 chip time。', '坡度与高温换算都是近似，不能替代实测。', '复盘看趋势与掉速点，不拿一次比赛判断能力。'] },
    en: { title: 'Pace and results', summary: 'Pace, grade, heat, splits and post-race review.', intro: 'The same target time is not the same pace on different grades and temperatures. These tools put conversion, prediction and review together so one formula is not used everywhere.', notes: ['Establish whether the input is gun time or chip time.', 'Grade and heat conversions are approximations, not substitutes for measurement.', 'Review trends and fade points; do not judge ability from one race.'] },
    tools: ['pace', 'splits', 'grade-adjusted-pace', 'heat-adjust', 'race-predict', 'run-walk', 'result-split-analyzer'],
  },
  {
    slug: 'fuel-and-gear',
    icon: 'flame',
    zh: { title: '补给与装备', summary: '碳水、出汗、负重与热习服，把“感觉”换成克与分钟。', intro: '补给与装备最容易靠感觉，也最容易在比赛日翻车。这一组要求你输入体重、时长、温度或装备清单，输出是可执行的区间而不是单一答案。', notes: ['先测一次出汗率，再谈补液量。', '装备称重要用同一台秤，含水和食物。', '热习服需要连续暴露，不是一次热跑。'] },
    en: { title: 'Fuel and gear', summary: 'Carbohydrate, sweat, load and heat acclimation: replace feel with grams and minutes.', intro: 'Fuelling and gear are where feel is most seductive and race-day failure most common. These tools ask for body mass, duration, temperature or a kit list, and return an actionable range rather than one answer.', notes: ['Measure sweat rate once before setting fluid targets.', 'Weigh gear on the same scale, including water and food.', 'Heat acclimation needs repeated exposure, not one hot run.'] },
    tools: ['fueling-planner', 'carb-load-planner', 'sweat-rate', 'gear-weight-planner', 'heat-acclimation-planner', 'shoe-mileage'],
  },
  {
    slug: 'routes-and-load',
    icon: 'route',
    zh: { title: '路线与负荷', summary: '轨迹、剖面、赛道对比与训练负荷。', intro: '路线工具只读本地文件，不上传轨迹；负荷工具看 7 天与 28 天的关系，不把单次训练当成结论。', notes: ['轨迹距离与官方赛道距离可能不同，比较前先统一口径。', '剖面图不是赛道几何的替代。', '负荷比是回顾工具，不是许可加量的通行证。'] },
    en: { title: 'Routes and load', summary: 'Tracks, profiles, course comparison and training load.', intro: 'Route tools read local files and never upload a track; the load tool reads the relationship between seven and 28 days, not a single session.', notes: ['Track distance can differ from the official course; align the basis before comparing.', 'A profile is not a substitute for course geometry.', 'A load ratio is a review tool, not permission to add volume.'] },
    tools: ['track-view', 'track-convert', 'track-simplify', 'route-compare', 'route-elevation', 'training-load', 'injury-risk-check'],
  },
];

export function toolCollection(slug: string): ToolCollection | undefined {
  return TOOL_COLLECTIONS.find((item) => item.slug === slug);
}
