// What makes a fact Short go viral, as rules the topic finder, the hook writer and the library all share.
import type { FactTopic } from "@/lib/topics";

/** The standard every suggested topic must meet. Used verbatim in the topic-finder prompts. */
export const VIRAL_STANDARD = `HYPER-VIRAL STANDARD. Suggest only stories a stranger would send to a friend within seconds of watching:
1. THE CLAIM: one sentence that sounds impossible, absurd or scary and is still documented ("a wave of molasses killed 21 people", "a dead pope was put on trial").
2. EXTREMES: real stakes or scale: death, money, power, a record, a "first / only / worst / biggest", or a huge number.
3. VISIBLE ACTION: a person, crowd or animal doing something a viewer can SEE in a picture, not an idea or a process.
4. THE TWIST: a hidden reason or reversal that lands in the last third and changes how the opening reads.
5. SPEED: it tells in about 40 seconds, and the strangest fact can be said inside the first three seconds.
6. REACTION: the viewer feels awe, shock, disgust, outrage or "no way" (and wants to check it).
REJECT: textbook explainers ("How X works", "Why the sky is blue", "What is X"), generic nature or school-science facts, anything the average person already learned at school, vague "history of X", lists, biographies without a twist, and anything whose only hook is "interesting".
TITLES are hooks, not headings: 4-9 words, a claim with a contradiction ("The Man Who Sold the Eiffel Tower Twice"), never "How/Why ..." unless the answer is shocking.`;

/** Angles that reliably make strong Shorts. Each topic search samples several so the suggestions stay varied. */
export const VIRAL_LENSES = [
  'true stories that sound like lies (documented but unbelievable)',
  'the worst, deadliest or most expensive mistake in a field, caused by something tiny',
  'cons, scams and hoaxes that fooled a whole country or famous experts',
  'bizarre wars, laws, trials and punishments that really happened',
  'strange mass events (epidemics of dancing or laughing, panics, mass hysteria) with documented records',
  'ordinary objects with a dark, deadly or secret history',
  'engineering disasters and the odd reason they happened',
  'impossible-looking survival stories and last-second escapes',
  'spies, decoys and deception tricks that actually worked',
  'ancient technology and builders that outsmarted what we assume they could do',
  'natural extremes: the loudest, hottest, deadliest or strangest event ever recorded',
  'animals and nature doing things that sound made up but are measured',
  'the human body and brain doing documented impossible things',
  'forgotten inventions and failed ideas that sound insane (pigeon-guided missiles, bat bombs)',
  'space and science shocks with a human story attached (a solar storm that burned telegraph offices)',
];

/** Quick-start focus chips for the topic finder: each one steers the research toward a proven viral angle. */
export const FOCUS_PRESETS: { label: string; focus: string }[] = [
  { label: 'Sounds like a lie', focus: 'true stories that sound like lies, documented but unbelievable' },
  { label: 'Epic mistakes', focus: 'the worst, deadliest or most expensive mistakes caused by something tiny' },
  { label: 'Cons & hoaxes', focus: 'cons, scams and hoaxes that fooled a whole country' },
  { label: 'Weird wars & trials', focus: 'bizarre wars, laws, trials and punishments that really happened' },
  { label: 'Dark objects', focus: 'ordinary objects with a dark, deadly or secret history' },
  { label: 'Spies & decoys', focus: 'spy tricks, decoys and deception that actually worked' },
  { label: 'Survival', focus: 'impossible-looking survival stories and last-second escapes' },
  { label: 'Nature extremes', focus: 'natural extremes and animals doing documented impossible things' },
];

/** Picks `count` lenses, different on every call, to give the research planner a fresh angle each time. */
export function pickLenses(count: number, random: () => number = Math.random) {
  const pool = [...VIRAL_LENSES];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  return pool.slice(0, count);
}

/** Editorial minimums for a suggested topic (scores are 0-20). Strong candidates first; weaker ones only if too few pass. */
export const VIRAL_GATE = { curiosity: 14, surprise: 14, visual: 12 } as const;
export const meetsViralGate = (s: { curiosity: number; surprise: number; visual: number }) =>
  s.curiosity >= VIRAL_GATE.curiosity && s.surprise >= VIRAL_GATE.surprise && s.visual >= VIRAL_GATE.visual;

const WIKI = (slug: string) => `https://en.wikipedia.org/wiki/${slug}`;
const t = (id: string, title: string, archetype: FactTopic["archetype"], fact: string, slug: string): FactTopic => ({ id: `viral-${id}`, title, archetype, fact, source: WIKI(slug) });

/** Hand-picked shock-value true stories, shown first in the topic library. Each is a starting point: the pipeline still fact-checks it independently. */
export const VIRAL_TOPICS: FactTopic[] = [
  t("lustig", "The Man Who Sold the Eiffel Tower Twice", "exploit", "In 1925 the con man Victor Lustig convinced scrap-metal dealers that Paris was selling the Eiffel Tower, took a payment, and was bold enough to try it again.", "Victor_Lustig"),
  t("molasses", "The Wave of Molasses That Flooded Boston", "object", "In 1919 a storage tank burst in Boston and released about 2.3 million US gallons of molasses, killing 21 people.", "Great_Molasses_Flood"),
  t("emu", "The War Australia Lost to Emus", "exploit", "In 1932 soldiers with machine guns were sent to cull emus damaging crops in Western Australia and pulled out after little success.", "Great_Emu_War"),
  t("dance", "The Town That Couldn't Stop Dancing", "experiment", "In 1518 hundreds of people in Strasbourg reportedly danced for days without rest in what is called the dancing plague.", "Dancing_plague_of_1518"),
  t("cadaver", "The Dead Pope Put on Trial", "exploit", "In 897 Pope Stephen VI had the corpse of his predecessor Formosus dug up and put on trial.", "Cadaver_Synod"),
  t("laugh", "The Laughing Epidemic That Closed Schools", "experiment", "In 1962 an outbreak of uncontrollable laughter began at a girls' school in Tanganyika and spread, forcing schools to close.", "Tanganyika_laughter_epidemic"),
  t("radium", "The Glowing Paint That Poisoned Its Painters", "object", "In the 1910s and 1920s young women painting watch dials with radium paint were told to point their brushes with their lips and later fell seriously ill.", "Radium_Girls"),
  t("ghost-army", "The Army of Inflatable Tanks", "exploit", "In World War II the US Ghost Army used inflatable tanks, fake radio traffic and recorded sounds to make the Germans see armies that were not there.", "Ghost_Army"),
  t("pigeon", "The Missile Steered by Pigeons", "experiment", "In World War II the psychologist B. F. Skinner trained pigeons to peck at a target image to steer a missile.", "Project_Pigeon"),
  t("bat-bomb", "The Bats That Were Meant to Burn Japan", "exploit", "A US World War II plan attached small incendiary devices to bats, and a test accidentally set fire to part of an army airfield.", "Bat_bomb"),
  t("krakatoa", "The Volcano Heard Thousands of Kilometres Away", "experiment", "The 1883 eruption of Krakatoa was reportedly heard more than 4,800 kilometres away.", "1883_eruption_of_Krakatoa"),
  t("vasa", "The Warship That Sank Minutes After Launch", "paradox", "In 1628 the Swedish warship Vasa sailed about 1,300 metres on her maiden voyage before sinking.", "Vasa_(ship)"),
  t("pig-war", "The War Where the Only Casualty Was a Pig", "exploit", "In 1859 a dispute over a shot pig on San Juan Island brought the United States and Britain close to war.", "Pig_War_(1859)"),
  t("tarrare", "The Man Who Could Eat Anything", "experiment", "In the 1790s the Frenchman Tarrare was famous for an enormous appetite and was studied by doctors and the army.", "Tarrare"),
  t("gage", "The Man Who Survived an Iron Rod Through His Head", "experiment", "In 1848 a rail worker named Phineas Gage survived an iron tamping rod passing through his skull, and his personality reportedly changed.", "Phineas_Gage"),
  t("nyos", "The Lake That Killed Thousands Overnight", "paradox", "In 1986 Lake Nyos in Cameroon released a huge cloud of carbon dioxide that killed about 1,700 people.", "Lake_Nyos_disaster"),
  t("halifax", "The Explosion That Flattened a City", "object", "In 1917 two ships collided in Halifax harbour and the explosion of a munitions ship devastated the city.", "Halifax_Explosion"),
  t("celeste", "The Ship Found Sailing With Nobody Aboard", "exploit", "In 1872 the merchant ship Mary Celeste was found drifting in the Atlantic with no one on board.", "Mary_Celeste"),
  t("fairies", "The Fairy Photos That Fooled Sherlock's Creator", "exploit", "In 1917 two cousins took photographs of fairies that many people believed, including Arthur Conan Doyle.", "Cottingley_Fairies"),
  t("piltdown", "The Skull That Fooled Scientists for 40 Years", "exploit", "The Piltdown Man skull, presented in 1912 as a missing link, was exposed as a forgery in 1953.", "Piltdown_Man"),
  t("stink", "The Summer London Couldn't Breathe", "paradox", "In the hot summer of 1858 the stench of the River Thames became so bad that Parliament was affected, which led to a new sewer system.", "Great_Stink"),
  t("antikythera", "The Computer Found in a Greek Shipwreck", "object", "The Antikythera mechanism, recovered from a shipwreck, is an ancient Greek geared device used to model the movements of the sky.", "Antikythera_mechanism"),
  t("carrington", "The Solar Storm That Sparked Telegraph Fires", "experiment", "In 1859 a huge solar storm caused telegraph systems to fail and some operators to get shocks, with sparks reported.", "Carrington_Event"),
  t("hachiko", "The Dog Who Waited Nine Years for His Owner", "object", "After his owner died in 1925, the Akita Hachiko returned to Shibuya station to wait for him for years.", "Hachik%C5%8D"),
  t("hatteras", "The Lighthouse Moved Half a Kilometre", "paradox", "In 1999 the 4,800-tonne Cape Hatteras lighthouse was moved about 880 metres inland to save it from the sea.", "Cape_Hatteras_Light"),
  t("tacoma", "The Bridge That Danced Itself Apart", "paradox", "In 1940 the Tacoma Narrows Bridge twisted in a moderate wind and collapsed months after opening.", "Tacoma_Narrows_Bridge_(1940)"),
  t("derinkuyu", "The Underground City Under a Farm", "object", "Derinkuyu in Turkey is a vast multi-level underground city that could shelter thousands of people.", "Derinkuyu_underground_city"),
  t("concrete", "The Roman Concrete That Heals Itself", "experiment", "Roman concrete has lasted two thousand years, and research suggests lime clasts help it heal small cracks.", "Roman_concrete"),
  t("turk", "The Chess Machine That Hid a Human", "exploit", "The Mechanical Turk, a famous 18th-century chess automaton, was operated by a hidden human player.", "Mechanical_Turk"),
  t("ten-days", "The Ten Days That Vanished From the Calendar", "paradox", "When the Gregorian calendar was introduced in 1582, ten days were skipped so dates would line up with the seasons.", "Gregorian_calendar"),
  t("no-summer", "The Eruption That Cancelled Summer", "paradox", "After the 1815 eruption of Mount Tambora, 1816 became known as the Year Without a Summer, with crop failures across the world.", "Year_Without_a_Summer"),
];
