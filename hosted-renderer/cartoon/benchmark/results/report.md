# Advanced Video AI benchmark scorecard

Benchmarks: mine, cart. Ours: rail, oil. Target = benchmark average; 100 = benchmark level.

| Measure | Target | mine | cart | rail | oil |
|---|---|---|---|---|---|
| **Overall score** | 100 | **95.4** | **95.5** | **39.4** | **33.6** |
| Picture shows what is being said | 0.71 | 0.712 | 0.708 | 0.083 | 0.333 |
| Built 3D sets | 6.87 | 6.66 | 7.08 | 5 | 4 |
| Overall render quality | 7.12 | 7 | 7.24 | 4.67 | 3 |
| 3D characters posed with the action | 3.5 | 4 | 3 | 3 | 2 |
| Light, shadow and depth | 6.69 | 6.22 | 7.16 | 4 | 3 |
| New views per minute (cuts + camera moves) | 44.7 | 48.1 | 41.3 | 15.9 | 15.0 |
| Median shot length (s) | 1.575 | 1.45 | 1.7 | 3.65 | 4.4 |
| Set changes per minute | 15.95 | 16.7 | 15.2 | 0.0 | 0.0 |
| Different places shown | 12 | 9 | 15 | 1 | 1 |
| Shot-type variety (0-1) | 0.724 | 0.696 | 0.753 | 0.371 | 0.276 |
| Object close-up share | 0.134 | 0.188 | 0.08 | 0.0 | 0.0 |
| Shots with a real action | 0.775 | 0.75 | 0.8 | 0.333 | 0.0 |
| Effects per minute | 16.25 | 12.8 | 19.7 | 0.0 | 0.0 |
| Moving-camera share | 0.305 | 0.25 | 0.36 | 0.0 | 0.0 |
| Lighting looks used | 3.5 | 3 | 4 | 1 | 1 |
| Sharpness (540x960) | 1281.55 | 863.1 | 1700.0 | 538.0 | 542.3 |
| Sound hits per minute | 28.35 | 22.6 | 34.1 | 125.7 | 55.1 |
| Loudness (LUFS) | -14 | -14.0 | -14.1 | -14.6 | -14.7 |
| Speaking rate (wpm) | — | 226.8 | 209.0 | 176.2 | 160.4 |

## Shot list: mine (61.11s, 32 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 2.0 | action | push_in | mine tunnel | shotgun, gold nugget, rail tracks | miner loads a shotgun with a gold nugget and aims/fires | spotlight, particles | yes | He loaded the shotgun with gold and fired it |
| 1 | 2.0 | 7.2 | action | static | mine room | mug, lantern, crates, teapot | gold projectile hits and vanishes into wall while buddy watches | light_beam, debris | yes | into the walls of the mine. His buddy just watches the gold vanish into the rock. So we're shooting gold into a gold mine? You see, |
| 2 | 9.2 | 1.5 | medium | push_in | mine tunnel | shotgun, rails | none |  | partial | it's called salting. He's |
| 3 | 10.7 | 5.4 | establishing | tracking | mine exterior | mine cart, newspaper, rocks, tracks | none |  | partial | dug this mine for 10 years and found nothing but rock. And tomorrow, a rich guy is coming to buy it. So |
| 4 | 16.1 | 1.5 | medium | static | office/saloon interior | table, gold pieces, lamp, paper money | miner talks at table showing money and gold |  | yes | he spent his last hundred bucks on |
| 5 | 17.6 | 1.3 | object_insert | static | office table | gold dust plate, $100 bills | none |  | yes | gold dust instead. Next morning, |
| 6 | 18.9 | 1.7 | establishing | tracking | mine yard by cliffs | vintage car, rail tracks, small building, rocks, trees | car drives into yard with people aboard |  | yes | the rich guy |
| 7 | 20.6 | 0.9 | character_closeup | static | mine yard | vintage car | man in white suit waves while car moves |  | partial | rolls up |
| 8 | 21.5 | 3.0 | action | static | mine entrance | mine entrance sign, rail tracks, support beam | rich man in white suit walks in and hits head on beam; others stand nearby |  | yes | in a white suit and bangs his head on |
| 9 | 24.5 | 3.0 | action | static | mine tunnel rock wall | rock wall, pickaxe, lantern, hat | expert hits wall with pickaxe and breaks chunk |  | yes | the first beam. But he's brought an expert. And the expert isn't stupid. He smashes a chunk of wall, swirls |
| 10 | 27.5 | 1.4 | action | static | mine tunnel | gold pan, bucket, lantern | expert swirls material in pan |  | yes | it in a pan, and gold |
| 11 | 28.9 | 1.1 | object_insert | static | mine tunnel | gold pan, water, gold flakes, ground, crates | flakes spin in pan |  | yes | flakes spin to |
| 12 | 30.0 | 1.0 | object_insert | static | mine tunnel | metal pan, knife, gold flakes, crates, barrel | knife stirring/scraping in pan |  | partial | the bottom. But under his |
| 13 | 31.0 | 0.5 | medium | static | mine tunnel | magnifying glass, water pan, lantern, mine cart, tracks | character holds magnifying glass over pan |  | yes | magnifying |
| 14 | 31.5 | 2.0 | action | tracking | mine tunnel | magnifying glass, knife, gold flakes, tracks, lantern | inspect with magnifying glass then lift flakes on knife |  | yes | glass, every flake is flat. |
| 15 | 33.5 | 0.5 | object_insert | static | mine tunnel | rock wall, projectile/impact mark | projectile appears/impact on wall |  | partial | Somebody shot |
| 16 | 34.0 | 0.6 | object_insert | static | mine tunnel | rock wall, gold leaf | none |  | yes | this gold |
| 17 | 34.6 | 1.1 | medium | static | mine tunnel | crates, rock wall, gold leaf | character gestures toward gold in wall |  | yes | into the wall. But |
| 18 | 35.7 | 4.8 | character_closeup | push_in | mine interior | lantern, barrel, suitcase, calendar, wood wall | none |  | yes | the rich guy |
| 19 | 40.5 | 2.7 | medium | static | mine interior | calendar, wood wall | none |  | no_words |  |
| 20 | 43.2 | 2.1 | action | static | mine interior | suitcase, money stacks, calendar, lantern | characters handle suitcase and money; one character moves/falls |  | no_words |  |
| 21 | 45.3 | 0.4 | establishing | static | mine entrance | mine entrance sign, train tracks, tools, banners | characters step out of doorway |  | no_words |  |
| 22 | 45.7 | 0.5 | action | static | mine entrance | money stacks, tracks, mine entrance | money thrown/flies around characters |  | no_words |  |
| 23 | 46.2 | 1.8 | action | push_in | mine interior | suitcase, paper money, cup, dynamite bundle | rich man produces bundle of dynamite |  | no_words |  |
| 24 | 48.0 | 3.2 | character_closeup | static | mine interior | dynamite sticks, match, barrel, top hat | character reveals and lights a dynamite stick | small flame | no_words |  |
| 25 | 51.2 | 0.6 | object_insert | static | mine interior | dynamite stick, flame | fuse is lit with sparks | sparks, small flame | no | just laughs. Why would anyone shoot |
| 26 | 51.8 | 2.0 | action | static | mine tunnel | mine cart, dynamite, tracks, rocks | character tosses explosive; views of cart and ground with firecracker | sparks | no | gold into a wall? That's insane! And his buddy nods. Completely insane. So the rich guy pays up. |
| 27 | 53.8 | 0.9 | medium | static | mine tunnel | tracks, lamps | none |  | no | And while those two bolt with the money, he |
| 28 | 54.7 | 0.9 | action | static | mine entrance | rocks, mine sign | explosion at entrance; character blown out and tumbles | explosion, smoke/dust | partial | stays behind and pulls a stick of dynamite |
| 29 | 55.6 | 0.4 | effect | static | mine interior |  | none | heavy dust/smoke | no | out of his suit. |
| 30 | 56.0 | 0.4 | establishing | static | mine tunnel | rocks, measuring tape, lantern, gold vein, dust smoke | dust clears to reveal a gold vein | dust, light glow | partial | He's never mined a |
| 31 | 56.4 | 4.7 | medium | push_in | mine tunnel | rocks, measuring tape, gold vein, lantern, hat | character gestures by the gold vein; distance marked ten feet |  | yes | day in his life. So he just lights it, tosses it down the tunnel like a firecracker, and runs. And when the dust clears, there's a vein of real gold as thick as your arm, ten feet past where the last guy gave up. |

## Shot list: cart (66.9s, 25 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 1.1 | medium | static | castle yard | hand drill, wooden panel, grass, stone wall, banner | character drills into a wood panel | debris_splinters | yes | He drilled 82 |
| 1 | 1.1 | 0.9 | object_insert | static | castle yard | drill bit, wooden panel, holes, shavings | close-up of holes being drilled | debris_splinters | yes | holes into the wood |
| 2 | 2.0 | 0.4 | establishing | pan | castle wall | stone wall, archway, banner, pavilion roof | none |  | no | because down |
| 3 | 2.4 | 2.3 | crowd | push_in | hillside below fort | palanquin, spears, flags, hill path | army marches up the hill; commander carried on palanquin | dust_smoke | yes | the hill an army is marching straight |
| 4 | 4.7 | 1.2 | action | tracking | fort road | palanquin, spears, fort wall, path | troops carry palanquin along wall | dust_smoke | partial | for his fort and while |
| 5 | 5.9 | 1.9 | crowd | tracking | castle gate courtyard | grindstones, swords, buckets, gate arch, benches | people sharpen swords; camera moves to another pair in the corner |  | yes | everyone else sharpened swords He's in the corner |
| 6 | 7.8 | 5.2 | action | static | fort courtyard | wooden hole board, drill/auger, stand, banners, grass | soldier drills holes while commander questions him |  | yes | still drilling his commander asks are we fighting them or grating cheese, but |
| 7 | 13.0 | 1.1 | action | static | fort courtyard | hole board, stand | two soldiers handle and tilt the board |  | no | it gets weirder He |
| 8 | 14.1 | 11.9 | action | static | fort courtyard | cart, hole board, long thin sticks with strings, rope | board is bolted to cart; sticks with strings inserted; strings twisted together; soldier slapped for touching |  | yes | bolts the wood onto a cart and into every hole goes something long and thin wrapped in paper each with a string Then he twists all the strings into one rope Nobody's allowed to touch one soldier reaches for it and he slaps |
| 9 | 26.0 | 2.8 | crowd | static | fort courtyard | banners, grass, moat/ditch | hard slap heard/seen and crowd reacts |  | yes | his hands so hard the whole fort hears it that night |
| 10 | 28.8 | 0.4 | establishing | static | fort wall platform | cart, lantern, rope coil | none |  | no | it |
| 11 | 29.2 | 7.5 | action | static | fort wall platform | cart, coat/cover, lantern | rain pours; he throws coat over cart and lies on top to cover it | rain | yes | pours So he throws his coat over the cart and lies on top of it like a human umbrella One drop gets in there and we're all dead the next |
| 12 | 36.7 | 2.3 | wide | static | castle wall | cart, stone parapet, mountains | none |  | partial | morning ladders slam against the walls and the |
| 13 | 39.0 | 1.4 | crowd | push_in | battlefield grass by fort | banners, spears, parasol, fort buildings | army advances/charges |  | yes | army charges Everyone |
| 14 | 40.4 | 3.0 | medium | push_in | castle wall | cart, torch, helmets | characters argue/talk |  | partial | screams at him to do something But he just watches them get |
| 15 | 43.4 | 1.7 | character_closeup | static | castle wall edge | parapet, fields, banners | none |  | no_words |  |
| 16 | 45.1 | 1.7 | crowd | pan | battlefield grass | banners, spears | soldiers bunch up shoulder-to-shoulder |  | yes | closer and closer until they're packed shoulder-to-shoulder close enough |
| 17 | 46.8 | 1.5 | medium | static | battlefield grass | shields, spears | none |  | yes | to see their teeth That's when |
| 18 | 48.3 | 2.4 | medium | static | fortress terrace | cart, launch board with tubes, rope fuse, torch | small ignition at device | sparks, small fire glow | partial | he rips off the coat and lights the rope |
| 19 | 50.7 | 7.8 | object_insert | tracking | fortress terrace device | fuse rope, multiple tubes, sparks | spark runs down fuse and splits to many leads | sparks, glow | yes | the spark races down it and splits into 82 tiny flames and each one hits a tube of gunpowder Strapped to an |
| 20 | 58.5 | 1.8 | medium | static | fortress terrace | launch board, sparks, torch | ignition of board/rockets | sparks, smoke | partial | arrow turning |
| 21 | 60.3 | 0.8 | action | static | fortress parapet | launch rack, smoke, rockets | rockets blast off | smoke, muzzle flash | no | every |
| 22 | 61.1 | 2.5 | establishing | pull_out | valley battlefield | rocket trails, fields, hills | mass rocket launch with trails | smoke trails, distant flashes | yes | one of them into a rocket all 82 blast off the cart at once |
| 23 | 63.6 | 1.7 | action | static | valley battlefield | rocket trails, army formation, explosions | rockets detonate among troops; large explosion | explosions, smoke, fire | yes | flying every which way But with the army packed that tight not |
| 24 | 65.3 | 1.5 | medium | static | fortress wall overlook | stone wall, mountains, sky, explosion cloud | large explosion plume grows behind the character | explosion, smoke, fire, glow | partial | a single one misses |

## Shot list: rail (67.77s, 18 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 3.9 | medium | static | workshop classroom | chalkboard, wall lamp, bookshelf, workbench, wrench | none |  | no | Rail ends almost touch, yet the gap saves trains. Steel rails get |
| 1 | 3.9 | 3.5 | medium | static | workshop classroom | chalkboard, lamp, workbench, bookshelf, wrench | none |  | no | longer when hot and shorter when cold. |
| 2 | 7.4 | 3.8 | medium | static | workshop classroom | chalkboard, bookshelf, workbench, hammer, wrench | none |  | no | Over a kilometer, a ten-degree rise adds about a finger’s width. |
| 3 | 11.2 | 3.7 | wide | static | workshop classroom | chalkboard, bookshelves, lamp | none |  | no | So why do tracks have gaps, and why do some look gapless? |
| 4 | 14.9 | 4.6 | medium | static | workshop classroom | chalkboard, lamp, workbench, bookshelf, wrench | none |  | no | Old lines used jointed rails: two ends bolted with bars, leaving a small space. In winter that space grows; |
| 5 | 19.5 | 3.5 | medium | static | workshop classroom | chalkboard, bookshelf, lamp | none |  | no | in summer it nearly closes. |
| 6 | 23.0 | 3.6 | medium | static | workshop classroom | chalkboard, desk, shelves, lamp, wrench | none |  | no | Without room, heat makes rails shove sideways and buckle. The |
| 7 | 26.6 | 3.6 | wide | static | workshop classroom | chalkboard, desk, shelves, lamp, wrench | none |  | no | clickety-clack noise came from those joints, not as the goal. |
| 8 | 30.2 | 4.1 | wide | static | workshop classroom | chalkboard, desk, shelves, lamp, wrench | none |  | no | Today many mainlines weld rails into long continuous lengths. They set the rail at a |
| 9 | 34.3 | 3.3 | medium | static | workshop classroom | chalkboard, desk, shelves, lamp, wrench | none |  | no | neutral temperature so forces balance. Clips, |
| 10 | 37.6 | 3.5 | character_closeup | static | workshop classroom | desk, chalkboard, lamp, hammer | none |  | no | anchors, and packed stone hold that stress in place. Still, |
| 11 | 41.1 | 3.5 | wide | static | workshop classroom | chalkboard, desk, shelves, lamp, wrench | none |  | no | insulated joints add small gaps where signals need them. |
| 12 | 44.6 | 6.3 | medium | static | workshop classroom | chalkboard, lamp, shelves, books, toolbox | group gestures and waves |  | no | In deep cold, joints can pull apart and break bolts. In extreme heat, welded rails can kink if not managed. |
| 13 | 50.9 | 2.7 | wide | static | workshop classroom | chalkboard, lamp, shelves, books, toolbox | characters point and gesture |  | partial | Standards tell crews how to control these risks. The |
| 14 | 53.6 | 4.0 | medium | static | workshop classroom | chalkboard, lamp, shelves, books, mallet | pointing and talking |  | partial | answer: give steel space or controlled grip so it can move safely. Like |
| 15 | 57.6 | 3.8 | medium | static | workshop classroom | chalkboard, lamp, shelves, books, toolbox | gestures and pointing |  | partial | deck boards need gaps, but steel pushes harder, so we plan it. |
| 16 | 61.4 | 3.7 | wide | static | workshop classroom | chalkboard, lamp, shelves, books | characters stand and gesture |  | no | That prevents buckles and breaks, and explains the old clickety-clack. Modern |
| 17 | 65.1 | 2.67 | wide | static | workshop classroom | chalkboard, lamp, shelves, books | group raises hands |  | no | mainlines often have no visible gaps at all. |

## Shot list: oil (11.97s, 3 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 4.4 | medium | static | ship deck | oil puddle, bucket, barrels, rope coil, sails/masts | none |  | partial | Sailors pour oil; white tips fade while swells keep moving. A |
| 1 | 4.4 | 4.7 | wide | static | ship deck | barrels, bucket, rope coil, mast/rigging | none |  | partial | thin film lowers surface pull and adds drag, so quick little ripples die. Oil only calms ripples, |
| 2 | 9.1 | 2.87 | wide | static | ship deck | barrels, crates, masts, flags | none |  | no | not the big waves. |
