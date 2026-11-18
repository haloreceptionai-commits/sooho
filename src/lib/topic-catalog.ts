import type { FactTopic } from "@/lib/topics";
import { VIRAL_TOPICS } from "@/lib/viral-topics";

// Internet-researched NOAA, NASA and Smithsonian article catalog. Claims are starting points; the pipeline still fact-checks each story.
const GENERAL_TOPICS: FactTopic[] = [
  {
    "id": "fact-8700d9c314-dfe22b",
    "title": "How Barnacles Glue Themselves to Ships",
    "archetype": "experiment",
    "fact": "Barnacles secrete a fast-curing natural cement that attaches them to surfaces.",
    "source": "https://oceanservice.noaa.gov/facts/barnacles.html"
  },
  {
    "id": "fact-a97b9e7da4-ec3503",
    "title": "Why the Sky Scatters Blue Light",
    "archetype": "experiment",
    "fact": "Air molecules scatter shorter blue wavelengths more strongly than longer red wavelengths.",
    "source": "https://spaceplace.nasa.gov/blue-sky/en/"
  },
  {
    "id": "fact-15c95961a3-3490c0",
    "title": "How River Shells Became Shirt Buttons",
    "archetype": "object",
    "fact": "Muscatine factories cut and polished buttons from freshwater mollusk shells.",
    "source": "https://americanhistory.si.edu/explore/stories/connecting-objects-place-5-stories-innovation-object-project"
  },
  {
    "id": "fact-c8fe335be9-d88cfe",
    "title": "Why Some Sea Creatures Glow",
    "archetype": "experiment",
    "fact": "Bioluminescence is light produced by living organisms.",
    "source": "https://oceanservice.noaa.gov/facts/biolum.html"
  },
  {
    "id": "fact-272a2a0adc-0fd950",
    "title": "Why Gravity Makes Planets Round",
    "archetype": "experiment",
    "fact": "Gravity pulls large bodies toward a roughly spherical shape.",
    "source": "https://spaceplace.nasa.gov/planets-round/en/"
  },
  {
    "id": "fact-48444c2835-d5566c",
    "title": "The Paper Bag Machine Worth Fighting For",
    "archetype": "exploit",
    "fact": "Margaret Knight patented a square-bottom paper-bag machine in 1871 after challenging Charles Annan's competing claim.",
    "source": "https://americanhistory.si.edu/explore/stories/putting-face-invention"
  },
  {
    "id": "fact-ba2b713db0-bea28c",
    "title": "The Ocean Noise That Wasn't a Monster",
    "archetype": "experiment",
    "fact": "The mysterious 1997 Bloop sound originated from an icequake.",
    "source": "https://oceanservice.noaa.gov/facts/bloop.html"
  },
  {
    "id": "fact-5b3225212d-155270",
    "title": "Why Big Telescopes Use Mirrors",
    "archetype": "object",
    "fact": "Curved mirrors gather and focus light and are easier to support than large lenses.",
    "source": "https://spaceplace.nasa.gov/en/educators/telescopes/"
  },
  {
    "id": "fact-9a67dffb05-bdc191",
    "title": "The Cloudy Liquid That Became Kevlar",
    "archetype": "experiment",
    "fact": "Stephanie Kwolek investigated an unusual cloudy polymer solution that led to Kevlar fibers.",
    "source": "https://invention.si.edu/invention-stories/recognize-unusual"
  },
  {
    "id": "fact-0d62efee74-63d028",
    "title": "How Coastal Mud Stores Carbon",
    "archetype": "experiment",
    "fact": "Coastal ecosystems capture and store carbon, known as blue carbon.",
    "source": "https://oceanservice.noaa.gov/facts/bluecarbon.html"
  },
  {
    "id": "fact-82a54e3a1e-8ca93c",
    "title": "How Your Phone Finds You From Space",
    "archetype": "object",
    "fact": "GPS receivers use signals from four or more satellites to calculate location.",
    "source": "https://www.spaceplace.nasa.gov/gps/en/"
  },
  {
    "id": "fact-1f02496047-bf4ba4",
    "title": "How Wind-Up Dolls Learned to Walk",
    "archetype": "object",
    "fact": "Enoch Morrison's 1862 walking doll used a spring mechanism to move its tin legs.",
    "source": "https://www.si.edu/stories/how-toys-follow-tech-evolution"
  },
  {
    "id": "fact-a628560052-4fe038",
    "title": "Why Brain Coral Has No Brain",
    "archetype": "paradox",
    "fact": "Brain corals are colonies of connected polyps, not animals with brains.",
    "source": "https://oceanservice.noaa.gov/facts/brain-coral.html"
  },
  {
    "id": "fact-4d3046fa2a-36f9d1",
    "title": "Why Winter Happens Near the Sun",
    "archetype": "paradox",
    "fact": "Earth's tilt causes seasons; Northern Hemisphere winter occurs when Earth is relatively close to the Sun.",
    "source": "https://spaceplace.nasa.gov/seasons/en/"
  },
  {
    "id": "fact-0ed2333490-4ff60c",
    "title": "The Tiny Robot Built From Toy Parts",
    "archetype": "object",
    "fact": "Sandia's MARV used parts from toy locomotives and pagers in a robot about one cubic inch in size.",
    "source": "https://invention.si.edu/invention-stories/collections-miniature-autonomous-robotic-vehicles"
  },
  {
    "id": "fact-fef2e9a496-83b7a7",
    "title": "The Fish That Keeps Its Body Warm",
    "archetype": "paradox",
    "fact": "Opah fin movement generates heat, and specialized blood vessels limit heat loss.",
    "source": "https://oceanservice.noaa.gov/facts/cold-blooded.html"
  },
  {
    "id": "fact-e947a8ff79-327899",
    "title": "Why the Moon Keeps Its Scars",
    "archetype": "paradox",
    "fact": "Earth erases craters through erosion and geological processes that are much weaker or absent on the Moon.",
    "source": "https://spaceplace.nasa.gov/craters/en/"
  },
  {
    "id": "fact-516281245c-d5f0b4",
    "title": "How Walking Helped Measure the Whole Earth",
    "archetype": "experiment",
    "fact": "The Banu Musa's project estimated Earth's circumference using measured ground distances corresponding to changes in Pole Star altitude.",
    "source": "https://invention.si.edu/invention-stories/ingenious-devices"
  },
  {
    "id": "fact-64b482ba42-4291df",
    "title": "Why Corals Spawn Together",
    "archetype": "experiment",
    "fact": "Hard corals release eggs and sperm together in mass spawning events.",
    "source": "https://oceanservice.noaa.gov/facts/coral-spawning.html"
  },
  {
    "id": "fact-ed6592c102-751c3a",
    "title": "How Flying Clocks Test Time Itself",
    "archetype": "experiment",
    "fact": "Clocks on aircraft and satellites experience time differently from clocks on Earth's surface.",
    "source": "https://spaceplace.nasa.gov/time-travel/en/"
  },
  {
    "id": "fact-d71390008b-f85059",
    "title": "The Steam Plane Launched From a Boat",
    "archetype": "object",
    "fact": "Langley's unpiloted Aerodrome No. 5 flew after a catapult launch over the Potomac in 1896.",
    "source": "https://www.smithsonianmag.com/smithsonian-institution/odd-early-flying-machine-made-history-didnt-have-right-stuff-180977658/"
  },
  {
    "id": "fact-d1b23261e7-38afaf",
    "title": "Why Coral Isn't a Plant",
    "archetype": "paradox",
    "fact": "Corals are animals that live in partnership with algae.",
    "source": "https://oceanservice.noaa.gov/facts/coral.html"
  },
  {
    "id": "fact-c77ef9245e-eb62cf",
    "title": "Why the Moon Only Seems to Change Shape",
    "archetype": "experiment",
    "fact": "Lunar phases reflect our changing view of the Moon's sunlit half.",
    "source": "https://spaceplace.nasa.gov/all-about-the-moon/en/"
  },
  {
    "id": "fact-0e2ac10235-7e8102",
    "title": "The Brown Box That Helped Launch Home Gaming",
    "archetype": "object",
    "fact": "Ralph Baer's team developed a switch-programmed multiplayer game prototype later licensed for the Magnavox Odyssey.",
    "source": "https://americanhistory.si.edu/explore/topics/invention-and-innovation"
  },
  {
    "id": "fact-762a0f0033-f53c40",
    "title": "Why Coral Turns White",
    "archetype": "paradox",
    "fact": "Stressed corals can expel their symbiotic algae and turn white.",
    "source": "https://oceanservice.noaa.gov/facts/coral_bleach.html"
  },
  {
    "id": "fact-c1aef73283-5f5297",
    "title": "The Space Robot That Folds Like Paper",
    "archetype": "object",
    "fact": "NASA's A-PUFFER robot uses origami-inspired folding to flatten itself for tight spaces.",
    "source": "https://spaceplace.nasa.gov/space-robots/en/"
  },
  {
    "id": "fact-fc519d9d07-c0617f",
    "title": "How Reefs Soften Storm Waves",
    "archetype": "experiment",
    "fact": "Coral reef structures buffer shorelines against waves and storms.",
    "source": "https://oceanservice.noaa.gov/facts/coral_protect.html"
  },
  {
    "id": "fact-c1aef73283-916451",
    "title": "The Rover That Drives Under Ice",
    "archetype": "object",
    "fact": "BRUIE is buoyant and rolls along the underside of ice in water.",
    "source": "https://spaceplace.nasa.gov/space-robots/en/"
  },
  {
    "id": "fact-4526bc44ec-a71d33",
    "title": "How Tiny Animals Build Stone Reefs",
    "archetype": "experiment",
    "fact": "Stony coral polyps build calcium carbonate skeletons.",
    "source": "https://oceanservice.noaa.gov/facts/coralmadeof.html"
  },
  {
    "id": "fact-372b20d03a-000154",
    "title": "Why Webb Had to Fold Inside Its Rocket",
    "archetype": "object",
    "fact": "The Webb telescope and sunshield were too large to launch fully deployed.",
    "source": "https://spaceplace.nasa.gov/james-webb-space-telescope/en/"
  },
  {
    "id": "fact-afdfbd2dfe-c7a953",
    "title": "How Water Runs Out of Oxygen",
    "archetype": "paradox",
    "fact": "Dead zones are areas with low dissolved oxygen.",
    "source": "https://oceanservice.noaa.gov/facts/deadzone.html"
  },
  {
    "id": "fact-25c2499b63-1e7c4a",
    "title": "Why Constellations Aren't Real Star Clusters",
    "archetype": "paradox",
    "fact": "Stars that appear grouped in constellations can lie at very different distances.",
    "source": "https://spaceplace.nasa.gov/constellations/en/"
  },
  {
    "id": "fact-9884fe2034-b96c9b",
    "title": "Why Sailing Ships Got Stuck at the Equator",
    "archetype": "experiment",
    "fact": "The doldrums are an equatorial belt where weak surface winds can stall sailing ships.",
    "source": "https://oceanservice.noaa.gov/facts/doldrums.html"
  },
  {
    "id": "fact-819fab2e3c-364305",
    "title": "How Planets Grow From Space Dust",
    "archetype": "experiment",
    "fact": "Material in a disk around the young Sun collided and accumulated into planets.",
    "source": "https://spaceplace.nasa.gov/solar-system-formation/en/"
  },
  {
    "id": "fact-628e564033-466fbc",
    "title": "Why Seawater Makes Thirst Worse",
    "archetype": "paradox",
    "fact": "Human kidneys need more water than seawater supplies to remove its salt.",
    "source": "https://oceanservice.noaa.gov/facts/drinksw.html"
  },
  {
    "id": "fact-a840fe9a5e-2c4c3e",
    "title": "How Spacecraft Make Power Far From Sunlight",
    "archetype": "object",
    "fact": "Spacecraft can use solar energy, batteries, or energy from unstable atoms, depending on their mission.",
    "source": "https://spaceplace.nasa.gov/what-powers-a-spacecraft/en/"
  },
  {
    "id": "fact-ee46cac508-d53ca5",
    "title": "Why Earth Isn't a Perfect Ball",
    "archetype": "paradox",
    "fact": "Earth is an irregular ellipsoid rather than a perfect sphere.",
    "source": "https://oceanservice.noaa.gov/facts/earth-round.html"
  },
  {
    "id": "fact-9c48873d4c-d67737",
    "title": "How the Ocean Makes Giant Swirls",
    "archetype": "experiment",
    "fact": "Eddies are circular currents that can separate from larger ocean currents.",
    "source": "https://oceanservice.noaa.gov/facts/eddy.html"
  },
  {
    "id": "fact-10f4abeb52-b3492c",
    "title": "Where Rivers Meet Salt Water",
    "archetype": "experiment",
    "fact": "Estuaries are places where river freshwater mixes with seawater.",
    "source": "https://oceanservice.noaa.gov/facts/estuary.html"
  },
  {
    "id": "fact-9bb5d6267f-baf872",
    "title": "The Oceans Hidden Beneath Alien Ice",
    "archetype": "experiment",
    "fact": "Scientists infer subsurface oceans on some moons; these are not open surface seas.",
    "source": "https://oceanservice.noaa.gov/facts/et-oceans.html"
  },
  {
    "id": "fact-8b500660af-eec10c",
    "title": "How Life Thrives in Extreme Places",
    "archetype": "paradox",
    "fact": "Extremophiles thrive in conditions such as extreme heat or pressure.",
    "source": "https://oceanservice.noaa.gov/facts/extremophile.html"
  },
  {
    "id": "fact-29c8034624-52c155",
    "title": "Where Fish Go When Lakes Freeze",
    "archetype": "experiment",
    "fact": "Many freshwater fish slow their metabolism and gather in deeper water during winter.",
    "source": "https://oceanservice.noaa.gov/facts/fish-freeze.html"
  },
  {
    "id": "fact-2b58873f45-681998",
    "title": "How Fish Rest Without a Bed",
    "archetype": "experiment",
    "fact": "Many fish reduce activity and metabolism while remaining alert to danger.",
    "source": "https://oceanservice.noaa.gov/facts/fish-sleep.html"
  },
  {
    "id": "fact-b0718e12d2-7eb479",
    "title": "Why the Garbage Patch Isn't an Island",
    "archetype": "paradox",
    "fact": "Ocean garbage patches contain dispersed debris, including tiny plastic particles.",
    "source": "https://oceanservice.noaa.gov/facts/garbagepatch.html"
  },
  {
    "id": "fact-9b8d5dabb7-c9c364",
    "title": "The Reef Bigger Than a Country",
    "archetype": "experiment",
    "fact": "The Great Barrier Reef is the world's largest coral reef system.",
    "source": "https://oceanservice.noaa.gov/facts/gbrlargeststructure.html"
  },
  {
    "id": "fact-7389830e34-3d602a",
    "title": "Why Sea Level Needs a Lumpy Model",
    "archetype": "experiment",
    "fact": "The geoid models global mean sea level as a reference for elevations.",
    "source": "https://oceanservice.noaa.gov/facts/geoid.html"
  },
  {
    "id": "fact-d8f0199d03-dcc483",
    "title": "Why Land Still Rises After Ice Melts",
    "archetype": "paradox",
    "fact": "Land continues to adjust after the removal of ice-age glaciers.",
    "source": "https://oceanservice.noaa.gov/facts/glacial-adjustment.html"
  },
  {
    "id": "fact-0cd5eee7db-d48d10",
    "title": "The Animal With a Glass Skeleton",
    "archetype": "experiment",
    "fact": "Glass sponges have skeletons made of silica.",
    "source": "https://oceanservice.noaa.gov/facts/glass-sponge.html"
  },
  {
    "id": "fact-e3852f3dcf-b367a9",
    "title": "Why Sea Level Isn't Level Everywhere",
    "archetype": "paradox",
    "fact": "Sea surface height varies around the globe.",
    "source": "https://oceanservice.noaa.gov/facts/globalsl.html"
  },
  {
    "id": "fact-6839fa2079-32e967",
    "title": "Why Green Turtles Are Called Green",
    "archetype": "experiment",
    "fact": "Green turtles are named for the greenish color of their fat, not their shells.",
    "source": "https://oceanservice.noaa.gov/facts/green-turtle.html"
  },
  {
    "id": "fact-24a836753c-76c247",
    "title": "The Sharks That Live for Centuries",
    "archetype": "experiment",
    "fact": "Scientists estimate Greenland sharks can live at least 250 years.",
    "source": "https://oceanservice.noaa.gov/facts/greenland-shark.html"
  },
  {
    "id": "fact-43a0eef64b-14e2db",
    "title": "Why Ocean Currents Form Giant Loops",
    "archetype": "experiment",
    "fact": "Gyres are large systems of rotating ocean currents.",
    "source": "https://oceanservice.noaa.gov/facts/gyre.html"
  },
  {
    "id": "fact-9c1965f3bf-9efc1d",
    "title": "Why Beaches Don't All Get Two High Tides",
    "archetype": "paradox",
    "fact": "The number and pattern of daily high tides vary by location.",
    "source": "https://oceanservice.noaa.gov/facts/high-tide.html"
  },
  {
    "id": "fact-94d77c8562-0f49b5",
    "title": "Why Horseshoe Crabs Aren't Crabs",
    "archetype": "paradox",
    "fact": "Horseshoe crabs are more closely related to spiders and scorpions than true crabs.",
    "source": "https://oceanservice.noaa.gov/facts/horseshoe-crab.html"
  },
  {
    "id": "fact-e2b1dbeb10-330792",
    "title": "How Warm Water Fuels Hurricanes",
    "archetype": "paradox",
    "fact": "Warm ocean water and thunderstorms provide energy and conditions for hurricanes to form.",
    "source": "https://oceanservice.noaa.gov/facts/how-hurricanes-form.html"
  },
  {
    "id": "fact-e54dbe2174-6cfe28",
    "title": "What Hurricanes Do Below the Waves",
    "archetype": "paradox",
    "fact": "Hurricanes create waves, currents, and shifting sediments that affect marine life.",
    "source": "https://oceanservice.noaa.gov/facts/hurricanes-sea-life.html"
  },
  {
    "id": "fact-2ff6e56781-130d64",
    "title": "How Microphones Listen Underwater",
    "archetype": "object",
    "fact": "Hydrophones detect and record underwater sounds.",
    "source": "https://oceanservice.noaa.gov/facts/hydrophone.html"
  },
  {
    "id": "fact-04a41b118f-4dbfee",
    "title": "Why Icebergs Can Look Blue",
    "archetype": "experiment",
    "fact": "Iceberg colors arise from light interacting with ice and material within it.",
    "source": "https://oceanservice.noaa.gov/facts/iceberg-color.html"
  },
  {
    "id": "fact-956a5120e8-302ee1",
    "title": "How Glaciers Launch Floating Ice Mountains",
    "archetype": "experiment",
    "fact": "Icebergs are pieces of glacier or shelf ice that break off and float.",
    "source": "https://oceanservice.noaa.gov/facts/iceberg.html"
  },
  {
    "id": "fact-d45296717a-c7a7c9",
    "title": "How One Step Can Change the Date",
    "archetype": "paradox",
    "fact": "Crossing the international date line changes the calendar date.",
    "source": "https://oceanservice.noaa.gov/facts/international-date-line.html"
  },
  {
    "id": "fact-5866bdb72e-afdd3f",
    "title": "Why Jellyfish Are Almost All Water",
    "archetype": "experiment",
    "fact": "Only about five percent of a jellyfish's body is solid matter.",
    "source": "https://oceanservice.noaa.gov/facts/jellyfish.html"
  },
  {
    "id": "fact-eafd87c526-34bc02",
    "title": "How Kelp Builds an Underwater Forest",
    "archetype": "experiment",
    "fact": "Kelp creates underwater habitat that shelters and feeds many species.",
    "source": "https://oceanservice.noaa.gov/facts/kelp.html"
  },
  {
    "id": "fact-bdd68e4a5e-a76f2a",
    "title": "The Giant Turtle Without a Hard Shell",
    "archetype": "experiment",
    "fact": "Leatherback turtles are the largest living sea turtles and have leathery rather than hard shells.",
    "source": "https://oceanservice.noaa.gov/facts/leatherback.html"
  },
  {
    "id": "fact-86e818a1b2-eb7a42",
    "title": "Why the Deep Ocean Is Dark",
    "archetype": "experiment",
    "fact": "Sunlight diminishes with depth, leaving much of the deep ocean without sunlight.",
    "source": "https://oceanservice.noaa.gov/facts/light_travel.html"
  },
  {
    "id": "fact-706581e9c8-7b9e3d",
    "title": "How Moving Cargo Can Rescue a Ship",
    "archetype": "object",
    "fact": "Lightering transfers oil or hazardous cargo from a compromised vessel to another vessel.",
    "source": "https://oceanservice.noaa.gov/facts/lightering.html"
  },
  {
    "id": "fact-123c5c5bd6-df3560",
    "title": "Why Beautiful Lionfish Become a Problem",
    "archetype": "paradox",
    "fact": "Invasive lionfish threaten native Atlantic reef fish and ecosystems.",
    "source": "https://oceanservice.noaa.gov/facts/lionfish.html"
  },
  {
    "id": "fact-2dfe3e9f36-291535",
    "title": "How Plants Can Protect a Shoreline",
    "archetype": "paradox",
    "fact": "Living shorelines stabilize coasts using natural materials including plants.",
    "source": "https://oceanservice.noaa.gov/facts/living-shoreline.html"
  },
  {
    "id": "fact-fd78859b2f-7e1e62",
    "title": "How Trees Survive in Salty Mud",
    "archetype": "experiment",
    "fact": "Mangroves grow in coastal intertidal zones and have adaptations to low-oxygen soils and salt water.",
    "source": "https://oceanservice.noaa.gov/facts/mangroves.html"
  },
  {
    "id": "fact-f73cfcaa3f-613030",
    "title": "Why It Snows Under the Sea",
    "archetype": "experiment",
    "fact": "Marine snow is organic debris falling from upper waters into the deep ocean.",
    "source": "https://oceanservice.noaa.gov/facts/marinesnow.html"
  },
  {
    "id": "fact-0050606cfd-f2b11f",
    "title": "How Forests Defend Moving Coastlines",
    "archetype": "experiment",
    "fact": "Maritime forests help protect shorelines affected by coastal movement.",
    "source": "https://oceanservice.noaa.gov/facts/maritime-forest.html"
  },
  {
    "id": "fact-9a34fcc3d0-b4f2c8",
    "title": "The Marsh Instrument That Doesn't Play Music",
    "archetype": "experiment",
    "fact": "A marsh organ lets scientists study how plants respond to different inundation levels.",
    "source": "https://oceanservice.noaa.gov/facts/marsh-organ.html"
  },
  {
    "id": "fact-be3c8491c2-d6c5cb",
    "title": "The Coral Reefs Living in Dim Light",
    "archetype": "experiment",
    "fact": "Mesophotic coral ecosystems occur in low-light waters.",
    "source": "https://oceanservice.noaa.gov/facts/mesophotic.html"
  },
  {
    "id": "fact-16914969ce-07945a",
    "title": "How Plastic Becomes Almost Invisible",
    "archetype": "experiment",
    "fact": "Microplastics are plastic pieces smaller than five millimeters.",
    "source": "https://oceanservice.noaa.gov/facts/microplastics.html"
  },
  {
    "id": "fact-8eb659539b-1f3664",
    "title": "Why Ships Measure Speed in Knots",
    "archetype": "object",
    "fact": "A knot measures speed, while a nautical mile measures distance.",
    "source": "https://oceanservice.noaa.gov/facts/nauticalmile_knot.html"
  },
  {
    "id": "fact-30e2aabdd9-c1c2c5",
    "title": "How a Nautilus Swims Like a Jet",
    "archetype": "experiment",
    "fact": "A nautilus moves by jet propulsion.",
    "source": "https://oceanservice.noaa.gov/facts/nautilus.html"
  },
  {
    "id": "fact-8e78e021b2-224851",
    "title": "How Underwater Robots Glide Without Propellers",
    "archetype": "object",
    "fact": "Ocean gliders change buoyancy and use wings to travel through the water.",
    "source": "https://oceanservice.noaa.gov/facts/ocean-gliders.html"
  },
  {
    "id": "fact-8f1f7af4c4-f5edfc",
    "title": "How Ship Noise Hides Whale Messages",
    "archetype": "paradox",
    "fact": "Human-generated ocean noise can mask natural sounds used by marine animals.",
    "source": "https://oceanservice.noaa.gov/facts/ocean-noise.html"
  },
  {
    "id": "fact-48a018dec6-a3682a",
    "title": "How Tiny Ocean Life Makes Oxygen",
    "archetype": "experiment",
    "fact": "Ocean photosynthetic organisms produce about half of Earth's oxygen; marine life also consumes oxygen.",
    "source": "https://oceanservice.noaa.gov/facts/ocean-oxygen.html"
  },
  {
    "id": "fact-93055d1213-6f624e",
    "title": "Why the Ocean Looks Blue",
    "archetype": "experiment",
    "fact": "Water absorbs red wavelengths more strongly, leaving more blue light visible.",
    "source": "https://oceanservice.noaa.gov/facts/oceanblue.html"
  },
  {
    "id": "fact-48d9b165c9-12bea9",
    "title": "Why Seawater Needs Extra Cold to Freeze",
    "archetype": "paradox",
    "fact": "Seawater freezes at a lower temperature than freshwater because of its salt.",
    "source": "https://oceanservice.noaa.gov/facts/oceanfreeze.html"
  },
  {
    "id": "fact-ec9806e567-c66e72",
    "title": "Where Almost All Earth's Water Hides",
    "archetype": "experiment",
    "fact": "About 97 percent of Earth's water is in the ocean.",
    "source": "https://oceanservice.noaa.gov/facts/oceanwater.html"
  },
  {
    "id": "fact-6ab40ddd19-d0c923",
    "title": "How Scientists Predict an Oil Spill's Path",
    "archetype": "experiment",
    "fact": "Oil-spill trajectory models forecast where oil may travel and which shores may be affected.",
    "source": "https://oceanservice.noaa.gov/facts/oil-spill-trajectory.html"
  },
  {
    "id": "fact-a52e156be8-1ac7ab",
    "title": "Why Oil Sometimes Leaks Naturally",
    "archetype": "experiment",
    "fact": "Oil seeps release crude oil and gas naturally through the seafloor.",
    "source": "https://oceanservice.noaa.gov/facts/oilseep.html"
  },
  {
    "id": "fact-d58dd79414-fbaee5",
    "title": "How Old Sow Makes a Giant Whirlpool",
    "archetype": "experiment",
    "fact": "Old Sow is a large whirlpool in the Western Hemisphere.",
    "source": "https://oceanservice.noaa.gov/facts/old-sow.html"
  },
  {
    "id": "fact-a2a19c5d1d-95e1c9",
    "title": "The Corals That Can Live for Millennia",
    "archetype": "experiment",
    "fact": "Studies indicate some corals can live for up to about 5,000 years.",
    "source": "https://oceanservice.noaa.gov/facts/oldest-living-animal.html"
  },
  {
    "id": "fact-e805100ae3-af970e",
    "title": "Why the Pacific Got a Peaceful Name",
    "archetype": "object",
    "fact": "Ferdinand Magellan named the Pacific Ocean.",
    "source": "https://oceanservice.noaa.gov/facts/pacific.html"
  },
  {
    "id": "fact-f99ab6802c-03b2d5",
    "title": "How Penguins Fly Through Water",
    "archetype": "paradox",
    "fact": "Penguins cannot fly in air but use their wings to propel themselves underwater.",
    "source": "https://oceanservice.noaa.gov/facts/penguinsfly.html"
  },
  {
    "id": "fact-c0c2ebe6fb-f1d6bd",
    "title": "The Sky River Called the Pineapple Express",
    "archetype": "paradox",
    "fact": "The Pineapple Express carries concentrated atmospheric moisture from the tropical Pacific.",
    "source": "https://oceanservice.noaa.gov/facts/pineapple-express.html"
  },
  {
    "id": "fact-59bb4f3768-1b2e90",
    "title": "Why Plankton Drift Instead of Navigate",
    "archetype": "experiment",
    "fact": "Plankton are organisms carried along by currents and tides.",
    "source": "https://oceanservice.noaa.gov/facts/plankton.html"
  },
  {
    "id": "fact-1bf2ecae43-c24b2f",
    "title": "The Mammal That Lays Eggs",
    "archetype": "paradox",
    "fact": "The platypus is an egg-laying mammal native to Australia.",
    "source": "https://oceanservice.noaa.gov/facts/platypus.html"
  },
  {
    "id": "fact-474590f2c5-0a6916",
    "title": "Why Ships Have Port and Starboard",
    "archetype": "object",
    "fact": "Port and starboard identify fixed vessel sides independent of an observer's direction.",
    "source": "https://oceanservice.noaa.gov/facts/port-starboard.html"
  },
  {
    "id": "fact-e97aa6b912-6f6630",
    "title": "Why a Man o' War Isn't One Animal",
    "archetype": "paradox",
    "fact": "A Portuguese man o' war is a siphonophore colony of specialized individuals.",
    "source": "https://oceanservice.noaa.gov/facts/portuguese-man-o-war.html"
  },
  {
    "id": "fact-eb23aac709-4a71d8",
    "title": "Why Seaweed Ends Up in Everyday Products",
    "archetype": "object",
    "fact": "Kelp-derived ingredients are used in products including foods and toothpaste.",
    "source": "https://oceanservice.noaa.gov/facts/pplkelp.html"
  },
  {
    "id": "fact-da48b73ade-ead9f7",
    "title": "Why Deep Water Squeezes So Hard",
    "archetype": "experiment",
    "fact": "Water pressure increases by roughly one atmosphere for every ten meters of depth.",
    "source": "https://oceanservice.noaa.gov/facts/pressure.html"
  },
  {
    "id": "fact-66fbfb010b-4bda4c",
    "title": "Why Red Tides Aren't Really Tides",
    "archetype": "paradox",
    "fact": "Red tide is a common name for a harmful algal bloom, not a tidal event.",
    "source": "https://oceanservice.noaa.gov/facts/redtide.html"
  },
  {
    "id": "fact-1d6235dfa0-5d66e4",
    "title": "How Bleached Coral Can Recover",
    "archetype": "paradox",
    "fact": "Corals may recover from bleaching if stress eases and local threats are reduced.",
    "source": "https://oceanservice.noaa.gov/facts/reef-resilience.html"
  },
  {
    "id": "fact-48c782b955-388275",
    "title": "How Rip Currents Escape the Beach",
    "archetype": "paradox",
    "fact": "Rip currents are powerful channeled flows moving away from shore.",
    "source": "https://oceanservice.noaa.gov/facts/ripcurrent.html"
  },
  {
    "id": "fact-af8714adb8-48885f",
    "title": "Why Sailors Feared the Roaring Forties",
    "archetype": "experiment",
    "fact": "Strong westerly winds characterize southern latitudes between 40 and 50 degrees.",
    "source": "https://oceanservice.noaa.gov/facts/roaring-forties.html"
  },
  {
    "id": "fact-30a21a8c55-83b75e",
    "title": "How Fish Make White Beach Sand",
    "archetype": "experiment",
    "fact": "Parrotfish produce some tropical sand by grinding coral and excreting it.",
    "source": "https://oceanservice.noaa.gov/facts/sand.html"
  },
  {
    "id": "fact-f145c8da96-11b937",
    "title": "How Freezing Sea Water Helps Move Oceans",
    "archetype": "paradox",
    "fact": "Sea-ice formation rejects much of its salt, making nearby water denser and encouraging sinking.",
    "source": "https://oceanservice.noaa.gov/facts/sea-ice-climate.html"
  },
  {
    "id": "fact-91c1c2c9ea-abdcab",
    "title": "Why Sea Cucumbers Aren't Vegetables",
    "archetype": "paradox",
    "fact": "Sea cucumbers are animals that commonly scavenge along the seafloor.",
    "source": "https://oceanservice.noaa.gov/facts/seacuke.html"
  },
  {
    "id": "fact-210be60226-57f28b",
    "title": "Why the Sea Sometimes Looks Like a Bubble Bath",
    "archetype": "experiment",
    "fact": "Sea foam forms when organic material in seawater is churned up.",
    "source": "https://oceanservice.noaa.gov/facts/seafoam.html"
  },
  {
    "id": "fact-29c2ae73af-c990a3",
    "title": "Why Sea Lions Walk Better Than Seals",
    "archetype": "experiment",
    "fact": "Seals and sea lions differ in flippers and how they move on land.",
    "source": "https://oceanservice.noaa.gov/facts/seal-sealion.html"
  },
  {
    "id": "fact-44903a164f-11f4c3",
    "title": "How Warmer Water Raises the Sea",
    "archetype": "paradox",
    "fact": "Warming expands seawater, while melting land ice adds water to the ocean.",
    "source": "https://oceanservice.noaa.gov/facts/sealevelclimate.html"
  },
  {
    "id": "fact-5c824193cb-85e031",
    "title": "The Mountains Hidden Under the Ocean",
    "archetype": "experiment",
    "fact": "Seamounts are underwater mountains rising steeply from the seafloor.",
    "source": "https://oceanservice.noaa.gov/facts/seamounts.html"
  },
  {
    "id": "fact-8b1f00fecf-47b4e6",
    "title": "Why a Moving Boat Confuses Your Brain",
    "archetype": "paradox",
    "fact": "Seasickness results from conflicting sensory information about motion.",
    "source": "https://oceanservice.noaa.gov/facts/seasickness.html"
  },
  {
    "id": "fact-7a3de191db-25e2eb",
    "title": "How a Lake Can Slosh Like a Bathtub",
    "archetype": "experiment",
    "fact": "A seiche is a standing wave that oscillates within a body of water.",
    "source": "https://oceanservice.noaa.gov/facts/seiche.html"
  },
  {
    "id": "fact-b1fa515420-14476b",
    "title": "How Ships See With Sound",
    "archetype": "object",
    "fact": "Sonar uses sound waves to detect objects and map underwater features.",
    "source": "https://oceanservice.noaa.gov/facts/sonar.html"
  },
  {
    "id": "fact-db72759b8d-ebca55",
    "title": "The Ocean Channel That Carries Distant Sounds",
    "archetype": "experiment",
    "fact": "Temperature and pressure can bend sound into a channel that carries it great distances.",
    "source": "https://oceanservice.noaa.gov/facts/sound.html"
  },
  {
    "id": "fact-24ffba4dc7-0182bf",
    "title": "How Baby Oysters Choose a Permanent Home",
    "archetype": "experiment",
    "fact": "Oyster larvae become spat when they permanently attach to a surface.",
    "source": "https://oceanservice.noaa.gov/facts/spat.html"
  },
  {
    "id": "fact-5403a76c9d-04fad1",
    "title": "Why Spring Tides Aren't About Spring",
    "archetype": "paradox",
    "fact": "Spring tides occur around new and full moons and are not named for the season.",
    "source": "https://oceanservice.noaa.gov/facts/springtide.html"
  },
  {
    "id": "fact-c02373d057-4eafa2",
    "title": "How Sea Stars Move Without Fish Fins",
    "archetype": "paradox",
    "fact": "Sea stars use a water vascular system to power tube feet.",
    "source": "https://oceanservice.noaa.gov/facts/starfish.html"
  },
  {
    "id": "fact-7ad6cb769d-ab1565",
    "title": "How Storms Push the Sea Onto Land",
    "archetype": "paradox",
    "fact": "Storm surge is the rise in seawater level caused by a storm.",
    "source": "https://oceanservice.noaa.gov/facts/stormsurge-stormtide.html"
  },
  {
    "id": "fact-24969c288a-a86582",
    "title": "Why Continents Never Truly Stand Still",
    "archetype": "experiment",
    "fact": "Tectonic plates making up Earth's crust move over time.",
    "source": "https://oceanservice.noaa.gov/facts/tectonics.html"
  },
  {
    "id": "fact-092d349ec0-a94cb7",
    "title": "How Tagged Animals Become Ocean Researchers",
    "archetype": "experiment",
    "fact": "Marine telemetry uses sensors on animals to collect movement and environmental data.",
    "source": "https://oceanservice.noaa.gov/facts/telemetry.html"
  },
  {
    "id": "fact-cd70917479-ca4a6c",
    "title": "How Warm Sand Changes Baby Turtles",
    "archetype": "experiment",
    "fact": "Incubation temperature influences sex determination in most turtles.",
    "source": "https://oceanservice.noaa.gov/facts/temperature-dependent.html"
  },
  {
    "id": "fact-b68d0f9877-d82472",
    "title": "How Coral Forms Rings Around Lagoons",
    "archetype": "experiment",
    "fact": "Atolls are a type of coral reef surrounding a lagoon.",
    "source": "https://oceanservice.noaa.gov/facts/threecorals.html"
  },
  {
    "id": "fact-5861815cd2-5cf9b1",
    "title": "How a Gauge Measures the Moving Sea",
    "archetype": "object",
    "fact": "Tide gauges measure changes in sea level relative to a height reference.",
    "source": "https://oceanservice.noaa.gov/facts/tide-gauge.html"
  },
  {
    "id": "fact-38fb128778-84b80b",
    "title": "How the Ocean Leaves Tiny Temporary Worlds",
    "archetype": "experiment",
    "fact": "Tide pools are isolated pockets of seawater in the intertidal zone.",
    "source": "https://oceanservice.noaa.gov/facts/tide-pool.html"
  },
  {
    "id": "fact-afe1971a3c-6573b4",
    "title": "How Trade Winds Shaped Sailing Routes",
    "archetype": "object",
    "fact": "Prevailing easterly trade winds helped guide historic ocean commerce.",
    "source": "https://oceanservice.noaa.gov/facts/tradewinds.html"
  },
  {
    "id": "fact-0b06bd2ad2-f59ebe",
    "title": "How Underwater Mud Races Downhill",
    "archetype": "paradox",
    "fact": "Turbidity currents are dense, sediment-laden flows moving rapidly downhill.",
    "source": "https://oceanservice.noaa.gov/facts/turbidity.html"
  },
  {
    "id": "fact-4c07e7ec17-a328f7",
    "title": "Why Baby Turtles Rush Out Together",
    "archetype": "experiment",
    "fact": "Mass hatching and group movement help sea turtle hatchlings survive predators.",
    "source": "https://oceanservice.noaa.gov/facts/turtle-hatch.html"
  },
  {
    "id": "fact-6c74011c44-274593",
    "title": "How the Seafloor Builds Smoking Chimneys",
    "archetype": "experiment",
    "fact": "Minerals in hot vent fluids precipitate as they mix with cold seawater, building chimneys.",
    "source": "https://oceanservice.noaa.gov/facts/vents.html"
  },
  {
    "id": "fact-4f77864dc7-2fd24d",
    "title": "Why Many Volcanoes Hide Underwater",
    "archetype": "experiment",
    "fact": "Many of Earth's volcanoes occur on the ocean floor along tectonic boundaries.",
    "source": "https://oceanservice.noaa.gov/facts/volcanoes.html"
  }
];

/** The hyper-viral stories come first; the general catalogue follows. */
export const FACT_TOPICS: FactTopic[] = [...VIRAL_TOPICS, ...GENERAL_TOPICS];
