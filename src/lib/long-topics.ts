// Topic suggestions for LONG-FORM videos: true stories and facts from antiquity to the present day that can carry an 8-15 minute documentary.
// Shorts have their own viral standard (viral-topics.ts); a long video needs a different test: something to follow for ten minutes.
import type { FactTopic } from '@/lib/topics';
import type { DiscoveredTopic } from '@/lib/topic-discovery';

export const LONGFORM_STANDARD = `DOCUMENTARY STANDARD. Suggest only true stories that can carry an 8-15 minute YouTube documentary about history and documented facts, from the ancient world to today:
1. A SUBJECT TO FOLLOW: one person, ship, object, place, plan or event the story can follow from the first scene to the last.
2. ESCALATION: three to five complications that each make things harder or bigger, and a turn or reversal near the middle that changes how the opening reads.
3. MATERIAL: plenty of documented detail (dates, numbers, names, quotes, places) in several independent sources such as books, archives, museums, universities and major newspapers.
4. THE QUESTION: a strange claim or unanswered question a stranger wants resolved ("How did one man sell the Eiffel Tower twice?", "Why did an empire's biggest army freeze?").
5. STAKES AND SCALE: lives, empires, fortunes, power, records, firsts or worsts.
6. VISUAL: places, crowds, objects, famous people and events that can be pictured scene after scene.
7. ANY ERA: ancient, medieval, early modern, the 19th century, the world wars, the Cold War and the last thirty years are all welcome. Famous names are good: rulers, generals, inventors, scientists, criminals.
REJECT: thin one-fact trivia (better as a 40-second Short), contested myths, textbook explainers ("How X works"), lists, vague "history of X", stories with only one source.
TITLES are curiosity-gap headlines of 5-10 words naming the person, object or event ("The Man Who Sold the Eiffel Tower Twice", "The Army That Froze in Russia"), never "How/Why ..." unless the answer is shocking.`;

export const LONG_LENSES = [
  'ancient world stories (Egypt, Greece, Rome, Persia, China, Carthage) with a famous leader or a building that still stands',
  'medieval stories: plagues, sieges, crusades, empires on horseback, cathedrals and the kings who ruled them',
  'early modern stories: age of exploration, armadas, trading companies, witch trials, revolutions and great fires',
  'nineteenth century stories: famines, wars, railways, cables, inventions and the people who raced to finish them',
  'the world wars: operations, deceptions, mistakes and individual decisions that changed the outcome',
  'the Cold War: near misses, spies, defections, space races and the officers who said no',
  'disasters and their hidden causes: ships, bridges, dams, reactors, airships, with the human decisions behind them',
  'cons, heists, hoaxes and forgeries that fooled governments and experts',
  'rivalries and feuds between famous people (scientists, inventors, rulers, explorers) that shaped history',
  'expeditions and survival: polar, ocean, mountain and desert journeys that should have ended in disaster',
  'the fall of empires, cities and companies: the last years and the single decisions that started the end',
  'famous rulers and public figures: the real story behind a name everyone knows',
  'modern history since 1990: crashes, leaks, rescues, cyber attacks and frauds that were documented in detail',
  'objects and places with a long documented biography (a diamond, a bridge, a painting, a library)',
];

/** Era and theme chips shown above the topic finder when the video is long-form. */
export const LONG_FOCUS_PRESETS: { label: string; focus: string; era?: LongEra }[] = [
  { label: 'Ancient world', focus: 'ancient world: Egypt, Greece, Rome, Persia, Carthage, a famous leader or building', era: 'ancient' },
  { label: 'Medieval', focus: 'medieval history: plagues, sieges, crusades, the Mongols, kings and castles', era: 'medieval' },
  { label: 'Age of empires', focus: 'early modern history: armadas, trading companies, explorers, revolutions, great fires', era: 'early-modern' },
  { label: '1800s', focus: 'nineteenth century: famines, wars, railways, cables, inventions and the race to finish them', era: '19th' },
  { label: '1900–1999', focus: 'twentieth century: the world wars, the Cold War, disasters, space and the decisions that changed them', era: '20th' },
  { label: 'Modern times', focus: 'history since 1990: financial crashes, leaks, rescues, cyber attacks and frauds', era: 'modern' },
  { label: 'Famous people', focus: 'the real story behind famous rulers, generals, inventors and public figures' },
  { label: 'Cons & heists', focus: 'cons, heists, forgeries and hoaxes that fooled governments and experts' },
  { label: 'Disasters', focus: 'disasters and the human decisions behind them: ships, bridges, reactors, airships' },
  { label: 'Survival & expeditions', focus: 'expeditions and survival stories that should have ended in disaster' },
];

export const LONG_ERAS = ['ancient', 'medieval', 'early-modern', '19th', '20th', 'modern'] as const;
export type LongEra = (typeof LONG_ERAS)[number];
export const ERA_LABEL: Record<LongEra, string> = { ancient: 'Ancient world', medieval: 'Medieval', 'early-modern': 'Age of empires', '19th': '1800s', '20th': '1900–1999', modern: 'Modern times' };

export function pickLongLenses(count: number, random: () => number = Math.random) {
  const pool = [...LONG_LENSES];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  return pool.slice(0, count);
}

export interface LongTopic extends FactTopic { era: LongEra; people: string[] }
const W = (slug: string) => `https://en.wikipedia.org/wiki/${slug}`;
const t = (id: string, era: LongEra, title: string, archetype: FactTopic['archetype'], fact: string, slug: string, people: string[] = []): LongTopic => ({ id: `long-${id}`, era, title, archetype, fact, source: W(slug), people });

/** Hand-picked documentary stories, oldest first. Each is a starting point: the pipeline still fact-checks it independently before writing. */
export const LONG_TOPICS: LongTopic[] = [
  t('hannibal', 'ancient', 'The General Who Marched Elephants Over the Alps', 'paradox', 'In 218 BC the Carthaginian general Hannibal led an army with war elephants across the Alps to attack Rome from the north, losing many men on the way.', 'Hannibal', ['Hannibal']),
  t('spartacus', 'ancient', 'The Slave Who Shook the Roman Republic', 'exploit', 'Spartacus led a slave revolt that began in 73 BC, defeated several Roman armies and was crushed in 71 BC.', 'Spartacus', ['Spartacus']),
  t('carthage', 'ancient', 'The City Rome Erased From the Map', 'paradox', 'In 146 BC Rome destroyed the city of Carthage at the end of the Third Punic War.', 'Third_Punic_War'),
  t('giza', 'ancient', 'The Workers\' Town Beside the Pyramids', 'object', 'Excavations at Giza found the settlement and cemeteries of the people who built the pyramids, evidence that they were fed and housed workers.', 'Giza_pyramid_complex'),
  t('hadrian', 'ancient', 'The Emperor Who Walled Off Britain', 'object', 'Work began on Hadrian\'s Wall in AD 122 and it ran across northern Britain for about 73 miles.', 'Hadrian%27s_Wall', ['Hadrian']),
  t('vesuvius', 'ancient', 'The Last Day of Pompeii', 'paradox', 'In AD 79 the eruption of Mount Vesuvius buried the Roman towns of Pompeii and Herculaneum under ash and volcanic material.', 'Eruption_of_Mount_Vesuvius_in_79_AD'),
  t('cleopatra', 'ancient', 'Cleopatra: The Last Pharaoh of Egypt', 'paradox', 'Cleopatra VII ruled Egypt until 30 BC, allied with Julius Caesar and Mark Antony, and was the last active ruler of the Ptolemaic dynasty.', 'Cleopatra', ['Cleopatra', 'Julius Caesar', 'Mark Antony']),
  t('black-death', 'medieval', 'The Plague Ships That Reached Sicily', 'paradox', 'In 1347 ships arriving at Messina brought the Black Death to Europe, a pandemic that killed a large share of the population.', 'Black_Death'),
  t('mongols', 'medieval', 'The Empire Built on Horseback', 'paradox', 'The Mongol Empire, founded by Genghis Khan, became the largest contiguous land empire in history.', 'Mongol_Empire', ['Genghis Khan']),
  t('constantinople', 'medieval', 'The Giant Cannon That Broke Constantinople', 'object', 'In 1453 Ottoman forces besieged Constantinople with enormous cannon and took the city on 29 May, ending the Byzantine Empire.', 'Fall_of_Constantinople', ['Mehmed II']),
  t('magna-carta', 'medieval', 'The Day Barons Put a King in His Place', 'exploit', 'In 1215 English barons forced King John to agree to the Magna Carta, which limited the power of the crown.', 'Magna_Carta', ['King John']),
  t('vinland', 'medieval', 'The Vikings Who Reached America', 'paradox', 'The archaeological site at L\'Anse aux Meadows in Newfoundland shows Norse settlers reached North America around the year 1000.', 'L%27Anse_aux_Meadows', ['Leif Erikson']),
  t('joan', 'medieval', 'The Peasant Girl Who Led France\'s Army', 'paradox', 'Joan of Arc, a teenage peasant, helped lift the siege of Orléans in 1429 and was later tried and executed.', 'Joan_of_Arc', ['Joan of Arc']),
  t('armada', 'early-modern', 'The Armada That the Weather Destroyed', 'paradox', 'In 1588 the Spanish Armada sailed against England under Queen Elizabeth I and was scattered by English fire ships and storms.', 'Spanish_Armada', ['Queen Elizabeth I', 'Philip II']),
  t('elizabeth', 'early-modern', 'Queen Elizabeth I: The Queen Who Never Married', 'paradox', 'Elizabeth I ruled England from 1558 to 1603 and never married, using the question of her marriage as a tool of diplomacy.', 'Elizabeth_I', ['Queen Elizabeth I']),
  t('voc', 'early-modern', 'The Company Richer Than a Nation', 'object', 'Founded in 1602, the Dutch East India Company was the first company to issue shares to the public and became one of the richest firms in history.', 'Dutch_East_India_Company'),
  t('london-fire', 'early-modern', 'The Great Fire That Rewrote London', 'paradox', 'The Great Fire of London in 1666 destroyed most of the old City, yet few deaths were officially recorded.', 'Great_Fire_of_London'),
  t('salem', 'early-modern', 'The Witch Trials of Salem', 'exploit', 'In 1692 and 1693 more than two hundred people were accused of witchcraft in Massachusetts and twenty were executed.', 'Salem_witch_trials'),
  t('bounty', 'early-modern', 'The Mutiny on the Bounty', 'exploit', 'In 1789 the crew of HMS Bounty took the ship from Captain William Bligh, who then sailed an open boat about 3,600 nautical miles.', 'Mutiny_on_the_Bounty', ['William Bligh', 'Fletcher Christian']),
  t('napoleon-russia', '19th', 'The Army That Froze in Russia', 'paradox', 'Napoleon\'s Grande Armée invaded Russia in 1812 and was destroyed by distance, hunger, disease and winter.', 'French_invasion_of_Russia', ['Napoleon']),
  t('famine', '19th', 'The Famine That Emptied Ireland', 'paradox', 'The Great Famine of 1845 to 1852 cut Ireland\'s population by roughly a quarter through death and emigration.', 'Great_Famine_(Ireland)'),
  t('light-brigade', '19th', 'The Charge That Was a Blunder', 'exploit', 'In 1854 the Light Brigade charged a Russian artillery position in the wrong valley because of a confused order.', 'Charge_of_the_Light_Brigade'),
  t('cable', '19th', 'The Cable Under the Atlantic', 'experiment', 'The first transatlantic telegraph cable of 1858 failed after weeks, and a lasting cable was laid in 1866.', 'Transatlantic_telegraph_cable', ['Cyrus Field']),
  t('golden-spike', '19th', 'The Race to the Golden Spike', 'experiment', 'Two railway companies raced toward each other and completed the first US transcontinental railroad at Promontory Summit in 1869.', 'Last_spike'),
  t('perry', '19th', 'The Warships That Opened Japan', 'exploit', 'In 1853 Commodore Matthew Perry sailed US warships into Edo Bay, which led to Japan\'s opening to foreign trade.', 'Matthew_C._Perry', ['Matthew Perry']),
  t('titanic', '20th', 'The Ship That Couldn\'t Sink', 'paradox', 'The Titanic struck an iceberg on her maiden voyage in April 1912 and sank with the loss of more than 1,500 lives.', 'Titanic'),
  t('mona-lisa', '20th', 'The Painting Stolen From the Louvre', 'exploit', 'In 1911 Vincenzo Peruggia stole the Mona Lisa from the Louvre, and it was found two years later in Italy.', 'Theft_of_the_Mona_Lisa', ['Vincenzo Peruggia']),
  t('truce', '20th', 'The Christmas Truce Where Enemies Met', 'paradox', 'In December 1914 soldiers on the Western Front stopped fighting, exchanged greetings and in places met in no man\'s land.', 'Christmas_truce'),
  t('endurance', '20th', 'The Ship Crushed by Ice, the Crew That Lived', 'experiment', 'After the ship Endurance was crushed by ice in 1915, all 28 men of Ernest Shackleton\'s expedition survived and were rescued in 1916.', 'Imperial_Trans-Antarctic_Expedition', ['Ernest Shackleton']),
  t('mincemeat', '20th', 'The Corpse That Fooled Hitler\'s Army', 'exploit', 'In 1943 British intelligence planted false invasion plans on a dead man\'s body to mislead Germany about the invasion of Sicily.', 'Operation_Mincemeat'),
  t('arkhipov', '20th', 'The Officer Who Said No to a Nuclear Launch', 'paradox', 'During the 1962 Cuban Missile Crisis the Soviet officer Vasily Arkhipov reportedly refused to agree to launch a nuclear torpedo from a submarine.', 'Vasily_Arkhipov', ['Vasily Arkhipov']),
  t('berlin-wall', '20th', 'The Press Conference That Opened the Berlin Wall', 'exploit', 'On 9 November 1989 a confused announcement at a press conference led crowds to the border and the opening of the Berlin Wall.', 'Fall_of_the_Berlin_Wall'),
  t('train-robbery', '20th', 'The Great Train Robbery of 1963', 'exploit', 'In 1963 a gang stopped a Royal Mail train in England and took about 2.6 million pounds in cash.', 'Great_Train_Robbery_(1963)'),
  t('dbcooper', '20th', 'The Hijacker Who Vanished With the Money', 'exploit', 'In 1971 a man calling himself Dan Cooper hijacked a plane, collected a ransom and parachuted away, and he was never identified.', 'D._B._Cooper'),
  t('apollo11', '20th', 'The Moon Landing That Almost Ran Out of Fuel', 'experiment', 'In 1969 Apollo 11\'s lander faced computer alarms and low fuel during its descent before Neil Armstrong landed it.', 'Apollo_11', ['Neil Armstrong']),
  t('apollo13', '20th', 'The Rescue of Apollo 13', 'experiment', 'After an oxygen tank failed in 1970, engineers on the ground improvised fixes that brought the Apollo 13 crew home alive.', 'Apollo_13'),
  t('chernobyl', '20th', 'The Night Chernobyl Exploded', 'object', 'On 26 April 1986 a reactor at Chernobyl exploded during a safety test and released radioactive material across Europe.', 'Chernobyl_disaster'),
  t('miners', 'modern', 'The 33 Miners Trapped for 69 Days', 'experiment', 'In 2010 thirty-three Chilean miners were trapped underground for 69 days and all were brought out alive.', '2010_Copiap%C3%B3_mining_accident'),
  t('stuxnet', 'modern', 'The Computer Worm That Sabotaged Iran', 'experiment', 'Stuxnet, discovered in 2010, was a computer worm that damaged centrifuges at an Iranian nuclear site.', 'Stuxnet'),
  t('lehman', 'modern', 'The Bank Whose Collapse Shook the World', 'paradox', 'The bankruptcy of Lehman Brothers in September 2008 was the largest in US history and deepened a global financial crisis.', 'Bankruptcy_of_Lehman_Brothers'),
  t('theranos', 'modern', 'The Blood-Testing Startup That Never Worked', 'exploit', 'Theranos claimed its machines could run many tests on a drop of blood; its founder Elizabeth Holmes was later convicted of fraud.', 'Theranos', ['Elizabeth Holmes']),
  t('panama', 'modern', 'The Leak of Eleven Million Documents', 'exploit', 'In 2016 journalists published the Panama Papers, about 11.5 million leaked documents on offshore companies.', 'Panama_Papers'),
  t('ftx', 'modern', 'The Exchange That Lost Billions Overnight', 'exploit', 'The cryptocurrency exchange FTX collapsed in November 2022, and its founder Sam Bankman-Fried was later convicted of fraud.', 'FTX', ['Sam Bankman-Fried']),
  t('y2k', 'modern', 'The Year the World Feared a Date', 'experiment', 'In the late 1990s governments and companies spent huge sums fixing the Year 2000 problem in computer systems.', 'Year_2000_problem'),
];

export const longTopicsByEra = (era: LongEra | 'all') => (era === 'all' ? LONG_TOPICS : LONG_TOPICS.filter(x => x.era === era));

/** A curated topic in the shape the Create page expects from a researched one (the pipeline fact-checks it independently before writing). */
export function curatedAsDiscovered(x: LongTopic): DiscoveredTopic {
  return {
    ...x, factKey: `long-${x.id}`, hook: x.title, whyWatch: `A documented ${ERA_LABEL[x.era].toLowerCase()} story with enough material for a full documentary.`, payoff: x.fact,
    caveat: 'Starting point only: the pipeline researches and fact-checks it before writing.',
    scores: { curiosity: 15, clarity: 15, visual: 15, payoff: 15, surprise: 15 },
    sources: [{ url: x.source, title: x.title, quote: x.fact.padEnd(30, '.') }],
  } as DiscoveredTopic;
}
