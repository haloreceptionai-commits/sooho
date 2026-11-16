/** Shorts Writer v4 prompts: the owner's task brief (Nov 16 2026), gold examples and bad->good lines, kept verbatim in spirit. */

export const GOLD_1 = `Hannibal was trapped, so he strapped fire to two thousand oxen.
217 BC. Rome has his army cornered in a valley.
The only way out is one narrow mountain pass, and four thousand Roman soldiers are guarding it.
Rome just has to wait.
So Hannibal comes up with a plan that sounds completely insane.
That night, his soldiers tie bundles of dry brushwood to the horns of two thousand oxen, and set them on fire.
Then they drive the burning herd up the hillside.
From the pass, the Roman guards see thousands of lights moving across the mountain in the dark.
They think Hannibal's entire army is breaking out, so they abandon the pass to stop them.
That's exactly what he wanted.
His real army walks through the empty pass and escapes with almost everything it came with.
By morning, Rome is chasing a herd of panicked oxen.
Hannibal didn't win with strength. He won by making the enemy look the wrong way.`;

export const GOLD_2 = `A gift with no battery spied on America for seven years.
1945. Soviet schoolchildren give the U.S. ambassador in Moscow a carved wooden seal.
He hangs it right behind his desk.
Security sweeps the room. No wires. No battery. Nothing.
Yet for seven years, the Soviets hear every private word.
Then in 1952, a British radio operator hears the ambassador's conversations on his radio, live.
How?
Inside the seal is a hollow chamber with a thin metal membrane.
A Soviet van parks outside and beams a radio signal at the building.
When someone speaks, the membrane vibrates and changes the signal bouncing back to the van.
The signal itself was the power. No battery to die, and nothing to find when the beam was off.
Its inventor was Leon Theremin, who also invented the instrument named after him.
America had hung the spy on its own wall.`;

export const WHY_GOLD = `WHY THE GOLD EXAMPLES WORK:
- The hook is a contradiction that doesn't reveal the mechanism.
- Stakes and setup arrive in the first 3 lines.
- Each line causes the next ("so", "but", "then", "that's exactly what he wanted").
- The explanation is simple and one idea per line.
- The ending reframes the story in new words.`;

export const BAD_GOOD = `BAD -> GOOD (from our old system's Moon Hoax output):
BAD: "New York bought the Moon with a borrowed glass." (meaningless)
BAD: "Plates sit empty while the clock slams toward print." (scene description)
BAD: "Richard Adams Locke and the team didn't sell the Moon at all." (confusing, wrong logic)
BAD closing: "New York kept its Moon with a borrowed name." (copies the hook's structure)
GOOD direction: "In 1835, a newspaper convinced New York there were bat people on the Moon." / "The Sun was a struggling paper, so its editor invented a news story about a giant telescope." / "He claimed the famous astronomer Sir John Herschel had seen unicorns and winged people through it." / "Readers loved it. Sales exploded." / "Herschel found out later, and he was not amused." / closing in new words: "People don't believe what's true. They believe what sounds like science."
(These lines show direction only; use only facts from the fact sheet.)`;

export const CORE = `CORE PRINCIPLE: a script is NOT a list of lines that pass checks. It is one cause-and-effect chain. Every line must (a) add one new concrete fact or story step, and (b) follow logically from the previous line. If a line could be deleted without the viewer noticing, delete it. If a viewer would ask "what does that mean?", rewrite it.`;

export const STYLE = `VOICE: a smart narrator telling a friend a true story. Past or present tense is fine, but NEVER describe a camera or a scene ("Plates sit empty...", "A foreman throws a flag hard" are forbidden). State facts and actions only.
STRUCTURE BY BEATS:
1. Hook (locked, given to you, word for word).
2. Setup: when/where + the problem within the first 3 lines, with real stakes or a number.
3. Escalation: one idea per line, linked by "so / but / then / that's when".
4. A question or open loop only where it is genuinely earned (about every 3-4 lines, not forced; a bare "How?" is fine only right after a surprising result).
5. Twist/payoff: show the mechanism in plain words, one idea per line, the simplest explanation possible.
6. Closing line: a reframe that echoes the theme but uses DIFFERENT words than the hook.
STYLE RULES:
- First mention of a person uses their name; after that he/she/they or "the editor", "the general". Never say a full name more than twice.
- Plain, concrete words. A viewer understands every line on the first listen.
- Short fragments are allowed only as intentional rhythm with meaning ("No wires. No battery. Nothing."); never fragments that are not complete thoughts.
- Similes/metaphors only if they make a mechanism easier to understand; drop decorative ones.
- No bare date lines like "1945." on their own; put the date inside a sentence.
- Every line advances the story. No filler, no line that restates the previous one.
- SIMPLICITY OVER COMPLETENESS: follow ONE story thread and use only the 5-8 facts that thread needs; leave the rest out. Never list several technical terms, methods or numbers in one line. No jargon a 12-year-old doesn't know (no "neutral temperature", "destressed", "tensors", "Marangoni", "hydro-oxygen"); say what it does in everyday words instead.
- Tell it as a STORY: people doing things, a problem, what they tried, what happened. Never write like a report ("he reported that", "he attributed", "he emphasized", journal or proceedings details, units lectures).
- The closing line must be a plain sentence a listener understands at once, not a slogan or abstract phrase.
- SPOKEN LANGUAGE: each line is ONE complete sentence a person can say in one breath. No semicolons. No colons chaining facts. No telegraphic noun stacks ("Emus trampled wheat and smashed rabbit fences; Depression losses meant ruin" is a caption, not speech). Read-aloud test: if it sounds like a report, a caption or an encyclopedia, rewrite it. Short fragments only when they carry meaning ("It sounded easy.").
- DATES: at most 2 dates in the whole script, and only a year or a single month. Never a day of the month ("2 November", "on 12"). Turn complicated timelines (phase one, phase two, withdrawal, restart) into at most 2 simple beats ("they pulled out, then came back").
- MUST-INCLUDE: every SHAREABLE FACT you are given must appear in the script, told vividly.
- ENDING: the closing line makes sense on its own, is under 15 words, reframes the story in new words (never copies the hook) and lands a punch: a contrast, an irony or a lesson. Bad: "In the end, the country and the birds beat the plan." (vague).
- Use ONLY facts marked certain in the fact sheet. No invented names, dates, numbers or quotes.`;

export const GOLD_BLOCK = `GOLD EXAMPLE 1 (target quality; copy the quality, never the content):\n${GOLD_1}\n\nGOLD EXAMPLE 2:\n${GOLD_2}\n\n${WHY_GOLD}\n\n${BAD_GOOD}`;
