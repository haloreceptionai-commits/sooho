# Advanced Video AI benchmark scorecard

Benchmarks: mine, cart. Ours: rail, oil. Target = benchmark average; 100 = benchmark level.

| Measure | Target | mine | cart | rail | oil |
|---|---|---|---|---|---|
| **Overall score** | 100 | **95.1** | **95.4** | **43.2** | **33.4** |
| Picture shows what is being said | 0.811 | 0.769 | 0.854 | 0.028 | 0.333 |
| Built 3D sets | 6.82 | 6.72 | 6.92 | 5 | 5 |
| Overall render quality | 7.165 | 7.25 | 7.08 | 5.67 | 3.33 |
| 3D characters posed with the action | 6.59 | 7.39 | 5.79 | 5.33 | 3 |
| Light, shadow and depth | 6.75 | 6.5 | 7 | 4.67 | 3 |
| New views per minute (cuts + camera moves) | 47.45 | 50.1 | 44.8 | 15.9 | 15.0 |
| Median shot length (s) | 1.575 | 1.45 | 1.7 | 3.65 | 4.4 |
| Set changes per minute | 16.05 | 17.7 | 14.4 | 0.9 | 0.0 |
| Different places shown | 12.5 | 9 | 16 | 2 | 1 |
| Shot-type variety (0-1) | 0.719 | 0.701 | 0.737 | 0.29 | -0.0 |
| Object close-up share | 0.134 | 0.188 | 0.08 | 0.0 | 0.0 |
| Shots with a real action | 0.871 | 0.781 | 0.96 | 1.0 | 0.333 |
| Effects per minute | 12.2 | 11.8 | 12.6 | 1.8 | 0.0 |
| Moving-camera share | 0.325 | 0.25 | 0.4 | 0.0 | 0.0 |
| Lighting looks used | 3.5 | 3 | 4 | 1 | 1 |
| Sharpness (540x960) | 1281.55 | 863.1 | 1700.0 | 538.0 | 542.3 |
| Sound hits per minute (info only, speech included) | — | 22.6 | 34.1 | 125.7 | 55.1 |
| Loudness (LUFS) | -14 | -14.0 | -14.1 | -14.6 | -14.7 |
| Speaking rate (wpm) | — | 226.8 | 209.0 | 176.2 | 160.4 |

## Shot list: mine (61.11s, 32 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 2.0 | action | static | mine tunnel | shotgun, gold nugget, rails, lamps | character loads shotgun with gold and fires |  | yes | He loaded the shotgun with gold and fired it |
| 1 | 2.0 | 7.2 | action | static | mine room | crates, cups, kettle, lantern, candles | gold blast hits wall while buddy watches; gold vanishes | projectile_beam, debris | yes | into the walls of the mine. His buddy just watches the gold vanish into the rock. So we're shooting gold into a gold mine? You see, |
| 2 | 9.2 | 1.5 | medium | push_in | mine tunnel | rails, lanterns, shotgun | none |  | partial | it's called salting. He's |
| 3 | 10.7 | 5.4 | establishing | static | mine exterior | rail cart, newspaper, rocks, tracks | none |  | yes | dug this mine for 10 years and found nothing but rock. And tomorrow, a rich guy is coming to buy it. So |
| 4 | 16.1 | 1.5 | medium | static | office/saloon interior | table, lamp, gold pile, money | none |  | yes | he spent his last hundred bucks on |
| 5 | 17.6 | 1.3 | object_insert | static | tabletop | plate, gold dust, $100 bill | none |  | yes | gold dust instead. Next morning, |
| 6 | 18.9 | 1.7 | establishing | static | mine exterior canyon | vintage car, mine shack, rail tracks, rocks, trees | car drives up to mine area |  | yes | the rich guy |
| 7 | 20.6 | 0.9 | character_closeup | static | mine exterior by car | vintage car, seats | rich man stands in car as it arrives |  | yes | rolls up |
| 8 | 21.5 | 3.0 | action | pull_out | mine entrance | beam, rail tracks, mine doorway, bunting | rich man in white suit bangs head on doorway beam |  | yes | in a white suit and bangs his head on |
| 9 | 24.5 | 3.0 | action | tracking | mine tunnel | pickaxe, rock wall, lantern, fallen hat | expert smashes wall chunk |  | yes | the first beam. But he's brought an expert. And the expert isn't stupid. He smashes a chunk of wall, swirls |
| 10 | 27.5 | 1.4 | action | static | mine tunnel | pan, water tub, lantern | expert pans material in water |  | yes | it in a pan, and gold |
| 11 | 28.9 | 1.1 | object_insert | static | mine tunnel | gold pan, water, gold flakes | flakes spin inside pan |  | yes | flakes spin to |
| 12 | 30.0 | 1.0 | object_insert | static | mine interior | metal pan, knife, gold flakes, wooden crates, barrel | knife scrapes in the pan |  | partial | the bottom. But under his |
| 13 | 31.0 | 0.5 | medium | static | mine interior | barrel, pan, magnifying glass, lantern, rail cart | character presents magnifying glass over pan |  | yes | magnifying |
| 14 | 31.5 | 2.0 | action | whip | mine tunnel | magnifying glass, gold flakes, knife, rail tracks, lantern | magnifying glass points to gold; knife lifts flakes to show flatness |  | yes | glass, every flake is flat. |
| 15 | 33.5 | 0.5 | object_insert | static | mine wall closeup | rock wall, gold/ore flakes, projectile | projectile approaches/impacts wall |  | partial | Somebody shot |
| 16 | 34.0 | 0.6 | object_insert | static | mine wall closeup | rock wall, gold leaf piece | gold flake sticks to wall |  | yes | this gold |
| 17 | 34.6 | 1.1 | medium | static | mine interior | crates, gold piece on wall | character talks and gestures toward wall |  | yes | into the wall. But |
| 18 | 35.7 | 4.8 | medium | push_in | mine interior | lantern, bucket, crate, door, hat | characters gesturing and stepping forward |  | yes | the rich guy |
| 19 | 40.5 | 2.7 | medium | static | mine interior | calendar, wall slats | none |  | no_words |  |
| 20 | 43.2 | 2.1 | action | static | mine interior | suitcase, money stacks, calendar, lantern | money placed and thrown; suitcase opened |  | no_words |  |
| 21 | 45.3 | 0.4 | establishing | static | mine entrance | rail tracks, pickaxes, sign, doorway, bunting | none |  | no_words |  |
| 22 | 45.7 | 0.5 | medium | static | mine entrance | money stacks, rail tracks, doorway | money flying and being held | flying_money | no_words |  |
| 23 | 46.2 | 1.8 | character_closeup | push_in | mine interior | suitcase, money stacks, lantern | character pulls out bundle of dynamite |  | no_words |  |
| 24 | 48.0 | 3.2 | character_closeup | static | mine tunnel interior | dynamite bundle, fuse, top hat | character holds dynamite; fuse burning | sparks | no_words |  |
| 25 | 51.2 | 0.6 | object_insert | static | mine tunnel interior | dynamite stick, fuse, flame | flame lights fuse; sparks fly | sparks, ember glow | no | just laughs. Why would anyone shoot |
| 26 | 51.8 | 2.0 | action | pan | mine tunnel interior | mine cart, dynamite, firecracker, rails | character tosses dynamite into cart; firecracker ends up on ground sparking | sparks | no | gold into a wall? That's insane! And his buddy nods. Completely insane. So the rich guy pays up. |
| 27 | 53.8 | 0.9 | medium | static | mine tunnel interior | tracks, lamps | character reacts; prepares to run |  | partial | And while those two bolt with the money, he |
| 28 | 54.7 | 0.9 | action | static | mine entrance exterior | mine sign, rocks, explosion smoke | character runs as explosion blasts him out; dust settles | explosion, smoke | partial | stays behind and pulls a stick of dynamite |
| 29 | 55.6 | 0.4 | effect | static | mine tunnel interior | dust, rocks | none | smoke/dust | no | out of his suit. |
| 30 | 56.0 | 0.4 | establishing | static | mine tunnel | rocks, tape measure, lantern, gold vein | dust clears revealing the tunnel wall and gold vein | dust, particles | partial | He's never mined a |
| 31 | 56.4 | 4.7 | action | push_in | mine tunnel | gold vein, rocks, tape measure, lantern, hat | character gestures by the gold vein; shows thickness and distance marking |  | yes | day in his life. So he just lights it, tosses it down the tunnel like a firecracker, and runs. And when the dust clears, there's a vein of real gold as thick as your arm, ten feet past where the last guy gave up. |

## Shot list: cart (66.9s, 25 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 1.1 | medium | static | castle yard | wood block, hand drill, banner | character drills into wood |  | yes | He drilled 82 |
| 1 | 1.1 | 0.9 | object_insert | static | castle yard | wood panel, drill bit, hose/pipe | drill making holes with wood chips |  | yes | holes into the wood |
| 2 | 2.0 | 0.4 | establishing | pan | castle wall exterior | banners | none |  | partial | because down |
| 3 | 2.4 | 2.3 | crowd | push_in | hillside outside fort | flags, palanquin, umbrella | army marches downhill with leader on palanquin |  | yes | the hill an army is marching straight |
| 4 | 4.7 | 1.2 | action | tracking | hillside by fort wall | palanquin, umbrella, flag | palanquin carried past fort |  | yes | for his fort and while |
| 5 | 5.9 | 1.9 | action | tracking | castle gate interior | grindstone wheels, swords, bench, gate door | people sharpen swords; cut to others at gate corner |  | yes | everyone else sharpened swords He's in the corner |
| 6 | 7.8 | 5.2 | medium | static | fort courtyard | wooden perforated board, workbench, tools, banner, stone wall | soldier drills holes in a wooden board while commander comments |  | yes | still drilling his commander asks are we fighting them or grating cheese, but |
| 7 | 13.0 | 1.1 | medium | static | fort courtyard | perforated board, stand, tower, fence | soldiers inspect and tilt the holed board |  | partial | it gets weirder He |
| 8 | 14.1 | 11.9 | action | static | fort courtyard | cart, perforated board, sticks with paper and strings, rope | board is bolted onto cart; long thin items inserted in holes; strings gathered; soldier gets slapped for reaching |  | yes | bolts the wood onto a cart and into every hole goes something long and thin wrapped in paper each with a string Then he twists all the strings into one rope Nobody's allowed to touch one soldier reaches for it and he slaps |
| 9 | 26.0 | 2.8 | crowd | static | fort moat area | stone wall, banners, grass bank | crowd reacts to a loud slap; hat flies; characters gather around |  | yes | his hands so hard the whole fort hears it that night |
| 10 | 28.8 | 0.4 | establishing | static | castle wall at night | cart, lamp | time shift to night showing cart and character on rampart |  | partial | it |
| 11 | 29.2 | 7.5 | action | static | castle wall rampart | cart, coat, rope, lamp | he throws coat over the cart and lies on top like an umbrella during rain | rain | yes | pours So he throws his coat over the cart and lies on top of it like a human umbrella One drop gets in there and we're all dead the next |
| 12 | 36.7 | 2.3 | medium | static | castle wall parapet | cart, stone wall, railing, distant mountains | character looks over wall beside cart |  | partial | morning ladders slam against the walls and the |
| 13 | 39.0 | 1.4 | crowd | push_in | battlefield grass | banners, shields, spears, palanquin | army advances/charges toward camera |  | yes | army charges Everyone |
| 14 | 40.4 | 3.0 | medium | static | castle courtyard | cart, torch | group confronts central man; they shout/gesture |  | yes | screams at him to do something But he just watches them get |
| 15 | 43.4 | 1.7 | wide | pull_out | hillside below wall | flags, shields, grassy slope, fields | enemy crowd approaches; foreground soldier grins |  | no_words |  |
| 16 | 45.1 | 1.7 | crowd | pan | battlefield grass | banners, shields, spears | crowd bunches tightly shoulder-to-shoulder |  | yes | closer and closer until they're packed shoulder-to-shoulder close enough |
| 17 | 46.8 | 1.5 | medium | static | battlefield grass | shields | soldiers smile showing teeth |  | yes | to see their teeth That's when |
| 18 | 48.3 | 2.4 | medium | static | fort parapet | cart, fuse board, rope fuse, torch, cloth cover | character removes cloth and lights fuse | small spark | yes | he rips off the coat and lights the rope |
| 19 | 50.7 | 7.8 | object_insert | push_in | fort parapet | fuse bundle, spark, tubes, gunpowder cartridges | spark races along fuse and splits to many leads | sparks, glow | yes | the spark races down it and splits into 82 tiny flames and each one hits a tube of gunpowder Strapped to an |
| 20 | 58.5 | 1.8 | medium | static | fort parapet | fuse board, cart, torch, sparks | device ignites | sparks, glow | partial | arrow turning |
| 21 | 60.3 | 0.8 | action | static | fort parapet | fuse board, smoke plume, balustrade | rockets blast off from board | smoke, sparks | partial | every |
| 22 | 61.1 | 2.5 | establishing | pan | valley battlefield | rocket trails, fields, stone wall, distant army mass | rockets streak into sky and outward | smoke trails | yes | one of them into a rocket all 82 blast off the cart at once |
| 23 | 63.6 | 1.7 | effect | pan | valley battlefield | rocket trails, explosions, fields, parapet rail | explosions among army and near camera | explosions, smoke | yes | flying every which way But with the army packed that tight not |
| 24 | 65.3 | 1.5 | medium | static | fort wall overlook | stone parapet, hills, sky, mushroom cloud explosion, smoke | large explosion rises behind the character | explosion, fire, smoke | partial | a single one misses |

## Shot list: rail (67.77s, 18 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 3.9 | medium | static | workshop classroom | chalkboard, lamp, desk, wrench, hammer | characters gesture and talk |  | no | Rail ends almost touch, yet the gap saves trains. Steel rails get |
| 1 | 3.9 | 3.5 | medium | static | workshop classroom | chalkboard, lamp, desk, wrench, hammer | characters gesture |  | no | longer when hot and shorter when cold. |
| 2 | 7.4 | 3.8 | medium | static | workshop classroom | chalkboard, lamp, desk, hammer | characters gesture |  | no | Over a kilometer, a ten-degree rise adds about a finger’s width. |
| 3 | 11.2 | 3.7 | wide | static | workshop classroom | chalkboard, bookshelves, lamp | foreground panel rises like a wipe | wipe_panel | no | So why do tracks have gaps, and why do some look gapless? |
| 4 | 14.9 | 4.6 | medium | static | workshop classroom | chalkboard, lamp, desk, wrench | characters point and talk |  | no | Old lines used jointed rails: two ends bolted with bars, leaving a small space. In winter that space grows; |
| 5 | 19.5 | 3.5 | medium | static | workshop classroom | chalkboard, bookshelf, lamp | foreground panel rises partially | wipe_panel | no | in summer it nearly closes. |
| 6 | 23.0 | 3.6 | medium | static | classroom | chalkboard, lamp, bookshelf, table, wrench | characters gesture and talk |  | no | Without room, heat makes rails shove sideways and buckle. The |
| 7 | 26.6 | 3.6 | wide | static | classroom | chalkboard, lamp, bookshelf, table | group gestures while talking |  | no | clickety-clack noise came from those joints, not as the goal. |
| 8 | 30.2 | 4.1 | wide | static | classroom | chalkboard, lamp, bookshelf, table, tools | characters gesture |  | no | Today many mainlines weld rails into long continuous lengths. They set the rail at a |
| 9 | 34.3 | 3.3 | medium | static | classroom | chalkboard, lamp, table, bottle | characters gesturing |  | no | neutral temperature so forces balance. Clips, |
| 10 | 37.6 | 3.5 | medium | static | classroom | chalkboard, lamp, table, hammer | characters talking and gesturing |  | no | anchors, and packed stone hold that stress in place. Still, |
| 11 | 41.1 | 3.5 | wide | static | classroom | chalkboard, lamp, bookshelf, table, tools | group gestures |  | no | insulated joints add small gaps where signals need them. |
| 12 | 44.6 | 6.3 | medium | static | classroom | chalkboard, lamp, shelves, bench, toolbox | characters wave and gesture |  | no | In deep cold, joints can pull apart and break bolts. In extreme heat, welded rails can kink if not managed. |
| 13 | 50.9 | 2.7 | wide | static | classroom | chalkboard, lamp, shelves, bench, toolbox | group gestures while standing |  | partial | Standards tell crews how to control these risks. The |
| 14 | 53.6 | 4.0 | medium | static | classroom | chalkboard, lamp, shelves, bench, bucket | characters point and gesture |  | no | answer: give steel space or controlled grip so it can move safely. Like |
| 15 | 57.6 | 3.8 | medium | static | classroom | chalkboard, lamp, shelves, bench, bucket | characters gesture |  | no | deck boards need gaps, but steel pushes harder, so we plan it. |
| 16 | 61.4 | 3.7 | wide | static | classroom | chalkboard, lamp, shelves, bench, bucket | group stands and gestures |  | no | That prevents buckles and breaks, and explains the old clickety-clack. Modern |
| 17 | 65.1 | 2.67 | wide | static | classroom | chalkboard, lamp, shelves, bench, bucket | characters raise hands |  | no | mainlines often have no visible gaps at all. |

## Shot list: oil (11.97s, 3 shots)

| # | Time | Len | Type | Camera | Set | Objects | Action | Effects | Shows words? | Spoken |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 4.4 | wide | static | ship deck | barrels, rope coil, bucket, oil puddle, masts | one sailor pours oil on deck while others gesture |  | partial | Sailors pour oil; white tips fade while swells keep moving. A |
| 1 | 4.4 | 4.7 | wide | static | ship deck | barrels, rope coil, small oil patch, rail | none |  | partial | thin film lowers surface pull and adds drag, so quick little ripples die. Oil only calms ripples, |
| 2 | 9.1 | 2.87 | wide | static | ship deck | masts, boxes, flags, boats | none |  | no | not the big waves. |
