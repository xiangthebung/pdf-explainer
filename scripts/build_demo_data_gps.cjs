const fs = require('fs');

const pdfB64 = fs.readFileSync('generated_pdf_b64.txt', 'utf8').trim();

const gpsExplanation = {
  startSlide: 1,
  endSlide: 10,
  totalSlides: 10,
  detectedClassType: "logic",
  detectedClassTypeExplanation: "Adapted with first-principles physics and engineering intuition, geometric trilateration diagrams, step-by-step relativistic time dilation breakdowns, and interactive exercises for Global Positioning System (GPS).",
  explanations: [
    {
      slideNumber: 1,
      blocks: [
        {
          type: "markdown",
          content: "### How GPS Works: From Satellites to Smartphones\n\n**The Global Navigation Architecture**\nThe **Global Positioning System (GPS)** is a space-based radionavigation constellation owned by the United States Space Force and operated globally. It consists of **31 active satellites** orbiting Earth at an altitude of approximately $20,200 \\text{ km}$ in Medium Earth Orbit (MEO).\n\nEvery satellite continuously broadcasts a radio signal containing its precise orbital coordinates $(x_i, y_i, z_i)$ and the exact timestamp $t_i$ at which the signal left the satellite.\n\n$$\\mathbf{r}_{sat}(t) = \\begin{bmatrix} x(t) \\\\ y(t) \\\\ z(t) \\end{bmatrix}$$\n\n**Key System Principles:**\n* **Passive Receiver**: Your smartphone only *receives* radio signals; it never transmits data back to satellites. This means an unlimited number of users can use GPS simultaneously without overloading the network.\n* **Speed of Light**: GPS signals travel as electromagnetic waves at $c \\approx 299,792,458 \\text{ m/s}$ (about $30 \\text{ cm}$ per nanosecond).\n\n**Satellite Constellation Geometry:**"
        },
        {
          type: "markdown",
          content: "```mermaid\ngraph TD\n    subgraph Space Segment\n        S1[\"Satellite 1 (MEO Orbit)\"]\n        S2[\"Satellite 2 (MEO Orbit)\"]\n        S3[\"Satellite 3 (MEO Orbit)\"]\n        S4[\"Satellite 4 (MEO Orbit)\"]\n    end\n    subgraph Ground & User Segment\n        S1 -->|\"L1/L2 Radio Signals (c)\"| Phone[\"Smartphone Receiver\"]\n        S2 -->|\"L1/L2 Radio Signals (c)\"| Phone\n        S3 -->|\"L1/L2 Radio Signals (c)\"| Phone\n        S4 -->|\"L1/L2 Radio Signals (c)\"| Phone\n        Phone --> Sol[\"4D Trilateration Matrix Solver\"]\n        Sol --> Output[\"Latitude, Longitude, Altitude & Time\"]\n    end\n```"
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "Think of GPS satellites as light houses scattered across outer space, each calling out its name and the exact microsecond timestamp on its clock. By listening to multiple lighthouses simultaneously, your phone figures out where you are relative to all of them!"
        },
        {
          type: "callout",
          calloutType: "Memory Hook",
          content: "GPS = Lighthouses in Space (Satellites broadcast timestamps; receivers calculate distances)."
        }
      ],
      quizQuestions: [
        {
          question: "Why can an unlimited number of smartphones use GPS simultaneously without clogging the satellite network?",
          options: [
            "Because smartphones are purely passive receivers that do not transmit radio signals back to space",
            "Because satellites use quantum entanglement to process user requests in parallel",
            "Because cell phone towers process all the satellite signals on the ground",
            "Because satellites store every phone's serial number in a central database"
          ],
          correctIndex: 0,
          explanation: "GPS is a broadcast system: satellites send signals outward, and phones listen passively without transmitting back."
        }
      ],
      matchingGames: [
        {
          concept: "Medium Earth Orbit (MEO)",
          definition: "Orbital altitude of ~20,200 km where GPS satellites complete two revolutions per day."
        },
        {
          concept: "Passive Receiver",
          definition: "Device that receives radio broadcasts without emitting any signals back to the transmitter."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "GPS radio signals travel through space at the speed of light, covering approximately 30 centimeters in just one",
          blankWord: "nanosecond",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 2,
      blocks: [
        {
          type: "markdown",
          content: "### Measuring Distance via Signal Time-of-Flight\n\n**The Distance Equation**\nAt its core, GPS relies on measuring the **Time-of-Flight (ToF)** of radio waves traveling from a satellite to your receiver. The pseudorange distance $d_i$ is calculated using the speed of light $c$:\n\n$$d_i = c \\cdot (t_{receive} - t_{transmit})$$\n\n**The Nanosecond Precision Sensitivity**\nBecause radio waves travel at $c \\approx 300,000 \\text{ km/s}$, extremely tiny timing inaccuracies translate into massive location errors:\n\n$$\\Delta d = c \\cdot \\Delta t$$\n\n* If the clock is off by **1 millisecond ($10^{-3} \\text{ s}$)**: $\\text{Error} = 300,000 \\text{ km/s} \\times 10^{-3} \\text{ s} = \\mathbf{300 \\text{ kilometers}}$!\n* If the clock is off by **1 microsecond ($10^{-6} \\text{ s}$)**: $\\text{Error} = 300,000 \\text{ km/s} \\times 10^{-6} \\text{ s} = \\mathbf{300 \\text{ meters}}$!\n* To achieve **1-meter accuracy**, the timing precision must be better than **3 nanoseconds ($3 \\times 10^{-9} \\text{ s}$)**!"
        },
        {
          type: "callout",
          calloutType: "Key Concept",
          content: "Pseudorange vs True Range: The raw calculated distance $c \\cdot (t_{receive} - t_{transmit})$ is called a 'pseudorange' because it includes errors caused by receiver clock bias and atmospheric delays."
        }
      ],
      exampleProblem: {
        problem: "Calculate the pseudorange distance $d$ (in kilometers) to a satellite if the radio signal transit time $\\Delta t$ is measured at $0.070 \\text{ seconds}$, assuming $c = 299,792,458 \\text{ m/s}$.",
        steps: [
          "Identify the distance formula: $d = c \\cdot \\Delta t$.",
          "Substitute $c = 299,792,458 \\text{ m/s}$ and $\\Delta t = 0.070 \\text{ s}$.",
          "Compute $d = 299,792,458 \\times 0.070 = 20,985,472.06 \\text{ meters}$.",
          "Convert meters to kilometers: $\\frac{20,985,472.06}{1000} \\approx 20,985.47 \\text{ km}$."
        ],
        finalAnswer: "d \\approx 20,985.47 \\text{ km}"
      },
      quizQuestions: [
        {
          question: "How large of a location error is produced if a GPS timing measurement is off by just 1 microsecond?",
          options: [
            "300 meters",
            "3 meters",
            "30 kilometers",
            "0.3 millimeters"
          ],
          correctIndex: 0,
          explanation: "Multiplying 1 microsecond (10^-6 s) by the speed of light (3x10^8 m/s) yields a 300-meter positional error."
        }
      ],
      matchingGames: [
        {
          concept: "Time-of-Flight (ToF)",
          definition: "Duration taken by a radio signal to travel from transmitter to receiver."
        },
        {
          concept: "Pseudorange",
          definition: "Apparent distance measured before correcting for clock biases and atmospheric delays."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "To achieve 1-meter positioning accuracy, GPS receivers must measure signal transit times with precision under three",
          blankWord: "nanoseconds",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 3,
      blocks: [
        {
          type: "markdown",
          content: "### Principles of 2D Trilateration\n\n**Geometric Intersection of Distance Circles**\nTrilateration determines location by measuring distances to known points, distinct from *triangulation* which measures angles.\n\n* **1 Satellite**: Gives a circle/sphere of radius $r_1$. Your location could be anywhere on that perimeter.\n* **2 Satellites**: Two intersecting circles narrow your position down to just **2 discrete points**.\n* **3 Satellites**: A third circle intersects at exactly **ONE unique point** on a 2D plane.\n\n**Visualizing 2D Trilateration Geometry:**"
        },
        {
          type: "markdown",
          content: "```svg\n<svg viewBox='0 0 500 280' xmlns='http://www.w3.org/2000/svg'>\n  <rect width='500' height='280' fill='#090d16' rx='12'/>\n  <!-- Circle 1: Sat A -->\n  <circle cx='180' cy='110' r='90' fill='none' stroke='#3b82f6' stroke-width='2' stroke-dasharray='4'/>\n  <circle cx='180' cy='110' r='6' fill='#3b82f6'/>\n  <text x='150' y='100' fill='#93c5fd' font-size='11' font-family='sans-serif'>Sat A (x1, y1)</text>\n  <!-- Circle 2: Sat B -->\n  <circle cx='310' cy='110' r='85' fill='none' stroke='#10b981' stroke-width='2' stroke-dasharray='4'/>\n  <circle cx='310' cy='110' r='6' fill='#10b981'/>\n  <text x='322' y='100' fill='#a7f3d0' font-size='11' font-family='sans-serif'>Sat B (x2, y2)</text>\n  <!-- Circle 3: Sat C -->\n  <circle cx='245' cy='190' r='80' fill='none' stroke='#f59e0b' stroke-width='2' stroke-dasharray='4'/>\n  <circle cx='245' cy='190' r='6' fill='#f59e0b'/>\n  <text x='255' y='210' fill='#fde68a' font-size='11' font-family='sans-serif'>Sat C (x3, y3)</text>\n  <!-- Intersection Point -->\n  <circle cx='245' cy='125' r='8' fill='#ef4444'/>\n  <text x='258' y='130' fill='#fca5a5' font-size='12' font-weight='bold' font-family='sans-serif'>User Position (x, y)</text>\n</svg>\n```"
        },
        {
          type: "callout",
          calloutType: "Real-World Example",
          content: "If you know you are 50 miles from Denver and 80 miles from Colorado Springs, those two circles intersect at two cities. Knowing you are also 110 miles from Pueblo pinpoints your exact single location."
        }
      ],
      quizQuestions: [
        {
          question: "What is the key geometric difference between Trilateration and Triangulation?",
          options: [
            "Trilateration measures distances from known points; Triangulation measures angles",
            "Trilateration uses optical lasers; Triangulation uses sonar waves",
            "Trilateration requires 100 satellites; Triangulation requires 2 satellites",
            "Trilateration only works on flat surfaces"
          ],
          correctIndex: 0,
          explanation: "Trilateration measures radial distances (circles/spheres); Triangulation uses angular bearings to form triangles."
        }
      ],
      matchingGames: [
        {
          concept: "Trilateration",
          definition: "Determining position by calculating intersecting distances from multiple reference points."
        },
        {
          concept: "Triangulation",
          definition: "Determining position by measuring angles between reference locations."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "On a 2D plane, two intersecting distance circles narrow your position down to exactly",
          blankWord: "two",
          sentenceAfter: "candidate points."
        }
      ]
    },
    {
      slideNumber: 4,
      blocks: [
        {
          type: "markdown",
          content: "### 3D Spherical Trilateration & The 4th Satellite\n\n**Solving for Space and Time**\nIn 3D space, distance from 3 satellites gives the intersection of 3 spheres, resulting in 2 points (one on Earth's surface and one deep in outer space, which is discarded).\n\n**Why Do We Need Satellite #4?**\nWhile satellites carry $100,000 atomic clocks, smartphones use cheap quartz crystal oscillators that drift significantly. This introduces a receiver clock offset variable $\\Delta t$.\n\nTo solve for four unknown variables $(x, y, z, \\Delta t)$, the receiver requires at least **4 equations from 4 satellites**:\n\n$$\\sqrt{(x - x_i)^2 + (y - y_i)^2 + (z - z_i)^2} + c \\cdot \\Delta t = d_i \\quad (i = 1, 2, 3, 4)$$\n\n**System Matrix Formulation:**"
        },
        {
          type: "markdown",
          content: "```mermaid\ngraph LR\n    S1[\"Sat 1 (x1, y1, z1)\"] --> Eq[\"Matrix Equations Solver\"]\n    S2[\"Sat 2 (x2, y2, z2)\"] --> Eq\n    S3[\"Sat 3 (x3, y3, z3)\"] --> Eq\n    S4[\"Sat 4 (x4, y4, z4)\"] --> Eq\n    Eq --> State[\"State Vector [x, y, z, dt]\"]\n```"
        },
        {
          type: "callout",
          calloutType: "Architecture Walkthrough",
          content: "The 4th satellite turns your smartphone into an atomic clock! By treating clock error as a 4th mathematical variable, the receiver corrects its internal quartz clock to match atomic satellite time."
        }
      ],
      quizQuestions: [
        {
          question: "Why is a 4th satellite required for 3D GPS navigation even though 3 spheres intersect at a point on Earth?",
          options: [
            "To solve for the smartphone's internal clock bias error (dt)",
            "To calculate the user's phone battery percentage",
            "To send map images from Google Servers",
            "To encrypt the radio signal for security"
          ],
          correctIndex: 0,
          explanation: "Smartphones lack atomic clocks. The 4th satellite equation solves for the receiver's clock bias variable along with 3D coordinates (x, y, z)."
        }
      ],
      matchingGames: [
        {
          concept: "Receiver Clock Bias (dt)",
          definition: "Timing offset between inexpensive smartphone quartz clocks and satellite atomic clocks."
        },
        {
          concept: "4D State Vector",
          definition: "Vector [x, y, z, dt] containing 3D spatial coordinates plus temporal bias."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "To solve for three spatial coordinates plus one clock bias offset, a GPS receiver requires signals from at least",
          blankWord: "four",
          sentenceAfter: "satellites."
        }
      ]
    },
    {
      slideNumber: 5,
      blocks: [
        {
          type: "markdown",
          content: "### Einstein's Relativity in Your Pocket\n\n**Special & General Relativity Dilation**\nGPS is one of the few everyday engineering systems where Einstein's theories of Relativity are essential for functioning!\n\n1. **Special Relativity (Speed Effect)**:\n   Satellites move at $v \\approx 14,000 \\text{ km/h}$. According to Special Relativity, fast-moving clocks tick **slower** relative to stationary clocks on Earth:\n   $$\\Delta t_{SR} = -7 \\, \\mu\\text{s / day}$$\n\n2. **General Relativity (Gravity Effect)**:\n   Satellites orbit $20,200 \\text{ km}$ high where Earth's gravity is weaker. According to General Relativity, clocks in weaker gravitational fields tick **faster**:\n   $$\\Delta t_{GR} = +45 \\, \\mu\\text{s / day}$$\n\n3. **Net Relativistic Drift**:\n   $$\\Delta t_{net} = +45 - 7 = \\mathbf{+38 \\, \\mu\\text{s / day}}$$\n\n**What If We Ignore Einstein?**\n$$38 \\times 10^{-6} \\text{ s} \\times 299,792,458 \\text{ m/s} \\approx \\mathbf{11.4 \\text{ kilometers error per day}}!$$"
        },
        {
          type: "callout",
          calloutType: "Key Concept",
          content: "Relativistic Pre-Correction: Before launching GPS satellites into space, engineers deliberately offset the atomic clock oscillator frequency from 10.23 MHz down to 10.22999999543 MHz so that once in orbit, relativistic dilation shifts it back to exactly 10.23 MHz!"
        }
      ],
      exampleProblem: {
        problem: "Calculate the positional drift error (in kilometers) caused over 5 days if relativistic time dilation (+38 microseconds/day) is uncorrected, using $c = 300,000 \\text{ km/s}$.",
        steps: [
          "Total accumulated time drift over 5 days: $\\Delta t_{total} = 5 \\times 38 \\, \\mu\\text{s} = 190 \\, \\mu\\text{s} = 1.9 \\times 10^{-4} \\text{ seconds}$.",
          "Apply distance drift formula: $\\text{Drift} = c \\cdot \\Delta t_{total}$.",
          "Substitute values: $\\text{Drift} = 300,000 \\text{ km/s} \\times 1.9 \\times 10^{-4} \\text{ s}$.",
          "Compute: $300,000 \\times 0.00019 = 57.0 \\text{ kilometers}$."
        ],
        finalAnswer: "\\text{Drift Error} = 57.0 \\text{ km}"
      },
      quizQuestions: [
        {
          question: "Why do atomic clocks on GPS satellites run 38 microseconds faster per day relative to clocks on Earth?",
          options: [
            "General Relativity gravity dilation (+45 us/day) outweighs Special Relativity velocity dilation (-7 us/day)",
            "Solar wind pushes the atomic clock pendulum faster",
            "Special Relativity velocity dilation makes moving clocks tick faster",
            "Satellites use solar panels which increase voltage to the clock"
          ],
          correctIndex: 0,
          explanation: "Weaker gravity at 20,200km altitude speeds up satellite clocks by +45 us/day, while orbital speed slows them by -7 us/day, netting +38 us/day."
        }
      ],
      matchingGames: [
        {
          concept: "Special Relativity (-7 us/day)",
          definition: "Time dilation caused by satellite high velocity relative to Earth."
        },
        {
          concept: "General Relativity (+45 us/day)",
          definition: "Time dilation caused by weaker gravitational potential at high altitude."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "Without Einstein's relativistic corrections, GPS calculated positions would drift by over 11 kilometers every single",
          blankWord: "day",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 6,
      blocks: [
        {
          type: "markdown",
          content: "### Atomic Clocks & Pseudo-Random Noise (PRN)\n\n**Signal Architecture & Code Multiplication**\nEach GPS satellite carries four atomic clocks (Rubidium and Cesium). Cesium atomic clocks measure the microwave emission of cesium-133 atoms during electron transitions at an incredible **9,192,631,770 Hz**.\n\n**Code Division Multiple Access (CDMA)**:\nAll 31 GPS satellites transmit radio signals on the exact same carrier frequencies:\n* **L1 Band**: $1575.42 \\text{ MHz}$\n* **L2 Band**: $1227.60 \\text{ MHz}$\n\nTo prevent signals from interfering with each other, each satellite encodes its transmission with a unique **Pseudo-Random Noise (PRN)** code (a binary Gold code sequence of 1,023 chips).\n\n**Cross-Correlation Matching**:\nYour smartphone generates an identical PRN sequence internally and slides it in time until it matches the incoming satellite wave. The time shift required for alignment equals the **signal propagation delay**!"
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "Imagine 31 people shouting in a room simultaneously, but each speaking a different distinct language. Your brain tunes into Spanish, filtering out French and German as background noise."
        }
      ],
      quizQuestions: [
        {
          question: "How do modern smartphones distinguish signals from 31 different GPS satellites sharing the same L1 frequency?",
          options: [
            "By matching unique Pseudo-Random Noise (PRN) Gold codes assigned to each satellite via CDMA",
            "By turning satellite antennas on and off every second",
            "By assigning each satellite a different color of visible light",
            "By asking the cell phone tower which satellite is closest"
          ],
          correctIndex: 0,
          explanation: "CDMA encoding assigns each satellite a unique PRN code sequence, allowing receivers to isolate signals on shared frequencies."
        }
      ],
      matchingGames: [
        {
          concept: "Gold Code / PRN",
          definition: "1023-bit binary sequence unique to each satellite used for signal identification and timing."
        },
        {
          concept: "Cross-Correlation",
          definition: "Mathematical phase-alignment technique determining exact time delay."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "The primary civilian GPS signal carrier frequency on the L1 band is centered at 1575.42",
          blankWord: "MHz",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 7,
      blocks: [
        {
          type: "markdown",
          content: "### Atmospheric Delays & Precision Errors\n\n**Sources of Error in GPS Measurement**\nGPS signals do not travel through a pure vacuum all the way to your phone. Several atmospheric and environmental phenomena introduce delays:\n\n| Error Source | Cause | Error Magnitude |\n| :--- | :--- | :--- |\n| **Ionospheric Refraction** | Solar UV ionizes free electrons in upper atmosphere ($100-1000\\text{km}$) | $5 - 15 \\text{ meters}$ |\n| **Tropospheric Delay** | Water vapor and air pressure in lower atmosphere ($0-20\\text{km}$) | $1 - 3 \\text{ meters}$ |\n| **Multipath Reflection** | Radio waves bouncing off buildings or mountains | $1 - 5 \\text{ meters}$ |\n| **Orbital & Clock Errors** | Minor satellite ephemeris inaccuracies | $1 - 2 \\text{ meters}$ |\n\n**Geometric Dilution of Precision (GDOP)**:\nIf all visible satellites are clustered tightly together in the sky, distance circles intersect at shallow angles, creating a large area of uncertainty (Poor GDOP). Broadly scattered satellites produce sharp, unambiguous intersections (Good GDOP)!"
        },
        {
          type: "callout",
          calloutType: "Real-World Example",
          content: "Urban Canyons: In cities with tall glass skyscrapers (like New York or Tokyo), GPS signals bounce off glass windows before reaching your phone, causing 'multipath error' that makes your map dot jump across streets."
        }
      ],
      quizQuestions: [
        {
          question: "What causes 'Multipath Error' in GPS positioning?",
          options: [
            "Radio signals reflecting off buildings, ground surfaces, or cliffs before reaching the receiver",
            "Having too many apps open on your smartphone",
            "Solar flares changing the speed of light in deep space",
            "Satellites colliding with space debris"
          ],
          correctIndex: 0,
          explanation: "Reflected signals travel longer path lengths than direct line-of-sight signals, causing distance overestimation."
        }
      ],
      matchingGames: [
        {
          concept: "Ionosphere",
          definition: "Atmospheric layer with free electrons that slows radio wave phase speed."
        },
        {
          concept: "GDOP (Geometric DOP)",
          definition: "Multiplier representing how satellite spatial geometry impacts positioning accuracy."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "When satellites are spread broadly across the sky rather than clustered together, the system achieves a favorable, low score in Geometric Dilution of",
          blankWord: "Precision",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 8,
      blocks: [
        {
          type: "markdown",
          content: "### High-Precision Navigation: DGPS & RTK\n\n**Centimeter & Millimeter Precision Systems**\nFor applications requiring pinpoint accuracy (autonomous vehicles, surveying, automated tractor farming), standard 3-meter GPS is insufficient.\n\n**1. Differential GPS (DGPS)**:\nUses a fixed ground reference station at an accurately surveyed location. The base station measures real-time atmospheric signal delays and broadcasts correction data to nearby rovers, reducing error to **$10-50 \\text{ cm}$**.\n\n**2. Real-Time Kinematic (RTK)**:\nInstead of tracking the coarse PRN code chips ($300 \\text{ m}$ wavelength), RTK tracks the **carrier wave phase** of the L1 signal (wavelength $\\lambda = 19 \\text{ cm}$).\n\n$$\\lambda_{L1} = \\frac{c}{f_{L1}} = \\frac{299,792,458 \\text{ m/s}}{1575.42 \\times 10^6 \\text{ Hz}} \\approx 0.1905 \\text{ m} = \\mathbf{19.05 \\text{ cm}}$$\n\nBy resolving the integer number of carrier wave cycles, RTK achieves **$1 - 2 \\text{ cm}$ precision**!"
        },
        {
          type: "callout",
          calloutType: "Key Concept",
          content: "How Autonomous Tractors Farm: Self-driving farm tractors use RTK GPS to plant crop rows with millimeter precision, preventing overlap and saving fertilizer!"
        }
      ],
      exampleProblem: {
        problem: "Calculate the carrier wavelength $\\lambda_{L2}$ (in centimeters) for the GPS L2 signal frequency $f_{L2} = 1227.60 \\text{ MHz}$, using $c = 299,792,458 \\text{ m/s}$.",
        steps: [
          "Identify wavelength equation: $\\lambda = \\frac{c}{f}$.",
          "Convert frequency to Hz: $f_{L2} = 1227.60 \\times 10^6 \\text{ Hz} = 1,227,600,000 \\text{ Hz}$.",
          "Compute $\\lambda = \\frac{299,792,458}{1,227,600,000} \\approx 0.2442 \\text{ meters}$.",
          "Convert meters to centimeters: $0.2442 \\times 100 = 24.42 \\text{ cm}$."
        ],
        finalAnswer: "\\lambda_{L2} \\approx 24.42 \\text{ cm}"
      },
      quizQuestions: [
        {
          question: "How does Real-Time Kinematic (RTK) GPS achieve 1-2 centimeter positioning precision?",
          options: [
            "By measuring the 19cm carrier wave phase instead of relying solely on coarse PRN code chips",
            "By placing 1,000 satellites into low Earth orbit",
            "By using 5G cell tower signals to replace satellites",
            "By increasing smartphone battery voltage"
          ],
          correctIndex: 0,
          explanation: "Carrier phase tracking evaluates fractions of the 19cm L1 radio wave, yielding millimeter resolution."
        }
      ],
      matchingGames: [
        {
          concept: "Differential GPS (DGPS)",
          definition: "Ground reference station network broadcasting real-time atmospheric correction factors."
        },
        {
          concept: "RTK (Real-Time Kinematic)",
          definition: "Carrier phase ambiguity resolution yielding 1-2 centimeter positioning."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "Real-Time Kinematic GPS measures the phase of the 19-centimeter L1 carrier wave to achieve positioning accuracy down to the",
          blankWord: "centimeter",
          sentenceAfter: "level."
        }
      ]
    },
    {
      slideNumber: 9,
      blocks: [
        {
          type: "markdown",
          content: "### The Global GNSS Constellation Landscape\n\n**International Satellite Navigation Systems**\nWhile 'GPS' specifically refers to the US system, modern smartphones utilize the broader **Global Navigation Satellite System (GNSS)** umbrella, locking onto four major global constellations:\n\n| System | Country / Region | Operational Satellites | Orbital Planes & Altitude |\n| :--- | :--- | :--- | :--- |\n| **GPS (Navstar)** | United States | 31 Satellites | 6 planes @ $20,200 \\text{ km}$ |\n| **Galileo** | European Union | 28 Satellites | 3 planes @ $23,222 \\text{ km}$ |\n| **BeiDou (BDS)** | China | 35 Satellites | Hybrid GEO / IGSO / MEO |\n| **GLONASS** | Russia | 24 Satellites | 3 planes @ $19,100 \\text{ km}$ |\n\n**Multi-Constellation Benefits**:\nBy receiving signals from 30+ satellites simultaneously across GPS, Galileo, BeiDou, and GLONASS, modern receivers maintain strong signal locks even in obstructed urban environments!"
        },
        {
          type: "callout",
          calloutType: "Memory Hook",
          content: "GNSS = The Four Champions of Space Navigation (GPS, Galileo, BeiDou, GLONASS)."
        }
      ],
      quizQuestions: [
        {
          question: "What is the primary advantage of modern multi-GNSS smartphone receiver chips?",
          options: [
            "They process signals from 30+ satellites across GPS, Galileo, BeiDou, and GLONASS simultaneously for faster, rock-solid locks",
            "They allow satellite signals to pass through solid concrete walls effortlessly",
            "They eliminate the need for satellite atomic clocks",
            "They reduce smartphone power consumption to zero"
          ],
          correctIndex: 0,
          explanation: "Accessing 30+ combined satellites across multiple global constellations drastically improves sky geometry and availability."
        }
      ],
      matchingGames: [
        {
          concept: "Galileo",
          definition: "European Union GNSS constellation providing high-accuracy civilian and search-and-rescue services."
        },
        {
          concept: "BeiDou",
          definition: "Chinese GNSS constellation utilizing a hybrid mix of GEO and MEO satellites."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "The European Union's high-precision civilian global satellite navigation system is named",
          blankWord: "Galileo",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 10,
      blocks: [
        {
          type: "markdown",
          content: "### Summary: The Complete GPS Pipeline\n\n**Mastering Satellite Navigation**\nYou now possess a complete first-principles understanding of how smartphones calculate your precise blue dot location on Earth!\n\n**The End-to-End Execution Pipeline Summary:**\n1. **Atomic Signal Broadcast**: Satellites transmit timestamped PRN Gold codes on L1/L2 frequencies.\n2. **Relativistic Pre-Correction**: Clocks pre-adjusted for $+38 \\, \\mu\\text{s/day}$ time dilation.\n3. **Atmospheric Delay Mitigation**: Dual-frequency and Klobuchar models compensate for ionospheric refraction.\n4. **4D Matrix Solver**: Smartphone solves system of 4 linear equations to extract $(x, y, z, \\Delta t)$.\n\n**End-to-End System Pipeline Diagram:**"
        },
        {
          type: "markdown",
          content: "```mermaid\ngraph LR\n    Sat[\"Satellites (Atomic Clocks)\"] -->|\"L1/L2 PRN Codes\"| Air[\"Atmosphere (Iono/Tropo Delay)\"]\n    Air -->|\"Radio Wave Propagation\"| Rec[\"Smartphone Receiver\"]\n    Rec -->|\"Cross-Correlation\"| Time[\"Signal Time-of-Flight (ToF)\"]\n    Time -->|\"4 Spherical Equations\"| Matrix[\"4D Solver [x, y, z, dt]\"]\n    Matrix --> Map[\"Blue Dot on Maps\"]\n```"
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "Every time you open Google Maps, your phone is performing real-time relativistic physics calculations across 20,000-kilometer outer space vectors in milliseconds!"
        }
      ],
      quizQuestions: [
        {
          question: "Which sequence correctly reflects the complete physical pipeline of a GPS measurement?",
          options: [
            "Atomic Broadcast -> Relativistic Correction -> Time-of-Flight Measurement -> 4D Matrix Solver -> Map Location",
            "Map Location -> Cell Tower Broadcast -> Atomic Clock -> Relativistic Shift",
            "4D Matrix Solver -> Solar Wind -> Satellite Transmission -> Quartz Oscillations",
            "Ionospheric Refraction -> Triangulation Angles -> Laser Pulse -> Blue Dot"
          ],
          correctIndex: 0,
          explanation: "Signals leave atomic clocks, account for relativistic dilation, travel through the atmosphere to measure ToF, and are solved in a 4D matrix solver."
        }
      ],
      matchingGames: [
        {
          concept: "4D Matrix Solver",
          definition: "Linearized solver computing spatial coordinates and clock bias in milliseconds."
        },
        {
          concept: "Cross-Correlation Phase Matching",
          definition: "Aligning receiver PRN copy with satellite broadcast wave to measure nanosecond transit time."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "The end-to-end GPS pipeline turns radio signals traveling 20,000 kilometers through space into an interactive blue dot on your phone's",
          blankWord: "map",
          sentenceAfter: "."
        }
      ]
    }
  ]
};

const demoDataTsContent = `import { ExplanationResponse } from "../types";

export const DEMO_PDF_BASE64 = "${pdfB64}";

export const DEMO_EXPLANATION: ExplanationResponse = ${JSON.stringify(gpsExplanation, null, 2)};
`;

fs.writeFileSync('src/components/DemoData.ts', demoDataTsContent);
console.log('Successfully updated src/components/DemoData.ts with new GPS slides!');
