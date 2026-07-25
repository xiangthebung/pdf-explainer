const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function buildGpsPdf() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [960, 540],
      margin: 0,
      autoFirstPage: false
    });

    const buffers = [];
    doc.on('data', b => buffers.push(b));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on('error', err => reject(err));

    const slideData = [
      {
        num: 1,
        title: "How GPS Works: From Satellites to Smartphones",
        subtitle: "Global Navigation Satellite Systems (GNSS)",
        bullets: [
          { bold: "Global Constellation:", text: " 31 operational satellites orbiting 20,200 km above Earth in Medium Earth Orbit (MEO)." },
          { bold: "Core Objective:", text: " Allows any receiver on Earth to determine its precise 3D position (x, y, z) and time t." },
          { bold: "Speed of Light:", text: " Radio signals travel at c = 299,792,458 m/s (approx 30 cm per nanosecond)." },
          { bold: "Passive Reception:", text: " Your phone only receives signals; it never transmits data back to space." }
        ],
        diagramType: "orbit"
      },
      {
        num: 2,
        title: "Measuring Distance via Signal Time-of-Flight",
        subtitle: "The Fundamental Distance Equation",
        bullets: [
          { bold: "Time-of-Flight (ToF):", text: " Distance d = c * (t_receive - t_transmit)." },
          { bold: "The Nanosecond Challenge:", text: " A 1 microsecond clock error causes a 300-meter position error!" },
          { bold: "Atomic Precision:", text: " Satellites carry Rubidium & Cesium atomic clocks accurate to 1 nanosecond." },
          { bold: "Pseudorange:", text: " The uncorrected measured distance before accounting for clock offsets." }
        ],
        diagramType: "tof"
      },
      {
        num: 3,
        title: "Principles of 2D Trilateration",
        subtitle: "Geometric Intersection of Distance Circles",
        bullets: [
          { bold: "1 Satellite:", text: " Defines a circle/sphere of radius r1. Receiver is anywhere on the perimeter." },
          { bold: "2 Satellites:", text: " Two intersecting circles narrow position down to 2 discrete points." },
          { bold: "3 Satellites:", text: " A 3rd circle intersects at exactly ONE unique point on a 2D plane." },
          { bold: "Spatial Triangulation:", text: " Relies purely on distance radii, not angular direction vectors." }
        ],
        diagramType: "trilateration2d"
      },
      {
        num: 4,
        title: "3D Spherical Trilateration & The 4th Satellite",
        subtitle: "Solving for Spatial Coordinates & Clock Bias",
        bullets: [
          { bold: "3D Spheres:", text: " Intersecting 3 spheres yields 2 points in space (one on Earth, one in space)." },
          { bold: "The 4th Satellite:", text: " Solves the receiver's internal quartz clock bias (dt)." },
          { bold: "System of 4 Equations:", text: " sqrt((x-x_i)^2 + (y-y_i)^2 + (z-z_i)^2) + c*dt = d_i" },
          { bold: "4 Unknowns:", text: " Solve for Receiver Position (x, y, z) + Clock Bias dt." }
        ],
        diagramType: "trilateration3d"
      },
      {
        num: 5,
        title: "Einstein's Relativity in Your Pocket",
        subtitle: "Special & General Relativity Corrections",
        bullets: [
          { bold: "Special Relativity (Speed):", text: " Satellite speed (14,000 km/h) makes clocks tick 7 microseconds slower/day." },
          { bold: "General Relativity (Gravity):", text: " Weaker gravity at 20,200 km altitude makes clocks tick 45 microseconds faster/day." },
          { bold: "Net Time Dilation:", text: " Clocks run +38 microseconds/day faster overall!" },
          { bold: "Without Relativity:", text: " GPS position calculations would drift by 11.4 kilometers every single day!" }
        ],
        diagramType: "relativity"
      },
      {
        num: 6,
        title: "Atomic Clocks & Pseudo-Random Noise (PRN)",
        subtitle: "Signal Encoding & Frequency Channels",
        bullets: [
          { bold: "Atomic Oscillation:", text: " Cesium resonance at 9,192,631,770 Hz ensures 10^-13 clock stability." },
          { bold: "Gold Codes / PRN:", text: " Each satellite broadcasts a unique Pseudo-Random Noise binary sequence." },
          { bold: "CDMA Multiplexing:", text: " All 31 satellites share L1 (1575.42 MHz) and L2 (1227.60 MHz) frequencies." },
          { bold: "Cross-Correlation:", text: " Receiver matches incoming PRN sequence to calculate exact signal delay." }
        ],
        diagramType: "prn"
      },
      {
        num: 7,
        title: "Atmospheric Delays & Precision Errors",
        subtitle: "Signal Disturbances & Geometric Dilution",
        bullets: [
          { bold: "Ionospheric Refraction:", text: " Solar ionization slows radio signals in upper atmosphere." },
          { bold: "Tropospheric Delay:", text: " Humidity and pressure in lower atmosphere cause additional delay." },
          { bold: "Multipath Reflection:", text: " Signals bouncing off skyscrapers or cliffs before reaching phone." },
          { bold: "GDOP (Geometric DOP):", text: " Poor satellite geometry (clustered together) degrades precision." }
        ],
        diagramType: "atmosphere"
      },
      {
        num: 8,
        title: "High-Precision Navigation: DGPS & RTK",
        subtitle: "Centimeter & Millimeter Precision Systems",
        bullets: [
          { bold: "Differential GPS (DGPS):", text: " Fixed ground reference stations compute real-time atmospheric corrections." },
          { bold: "Carrier-Phase Tracking:", text: " RTK measures the 19cm wavelength of L1 carrier wave instead of PRN code." },
          { bold: "Millimeter Accuracy:", text: " Enables autonomous tractor farming, land surveying, and drone docking." },
          { bold: "Network RTK:", text: " Streams correction data over cellular networks (NTRIP protocol)." }
        ],
        diagramType: "rtk"
      },
      {
        num: 9,
        title: "The Global GNSS Constellation Landscape",
        subtitle: "International Satellite Navigation Systems",
        bullets: [
          { bold: "US GPS (Navstar):", text: " 31 Satellites, 20,200 km altitude, 6 orbital planes." },
          { bold: "EU Galileo:", text: " 28 Satellites, high-precision open service & search/rescue." },
          { bold: "China BeiDou:", text: " 35 Satellites, hybrid GEO/IGSO/MEO orbit configuration." },
          { bold: "Multi-GNSS Chips:", text: " Modern phones track 30+ satellites simultaneously across 4 systems." }
        ],
        diagramType: "gnss"
      },
      {
        num: 10,
        title: "Summary: The Complete GPS Pipeline",
        subtitle: "From Satellite Transmission to Smartphone Map",
        bullets: [
          { bold: "1. Atomic Transmission:", text: " Satellites broadcast timestamped L1/L2 PRN codes." },
          { bold: "2. Relativistic Adjustment:", text: " Pre-offset clock frequencies by -38 microseconds/day." },
          { bold: "3. Atmospheric Correction:", text: " Dual-frequency measurements cancel ionospheric error." },
          { bold: "4. Matrix Solver:", text: " Solves 4 equations in real-time to render your blue dot." }
        ],
        diagramType: "summary"
      }
    ];

    slideData.forEach((slide, idx) => {
      doc.addPage();

      // 1. Canvas Background - Dark Slate Theme
      doc.rect(0, 0, 960, 540).fill('#0f172a');

      // Decorative top accent bar
      doc.rect(0, 0, 960, 6).fill('#3b82f6');

      // 2. Header Box
      doc.roundedRect(24, 20, 912, 56, 8).fill('#1e293b');
      doc.roundedRect(24, 20, 912, 56, 8).lineWidth(1).stroke('#334155');

      // Badge
      doc.roundedRect(36, 32, 110, 32, 6).fill('#2563eb');
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
         .text(`SLIDE ${slide.num} / 10`, 36, 42, { width: 110, align: 'center' });

      // Slide Title & Subtitle
      doc.fillColor('#f8fafc').fontSize(18).font('Helvetica-Bold')
         .text(slide.title, 160, 28, { width: 750 });
      doc.fillColor('#94a3b8').fontSize(11).font('Helvetica')
         .text(slide.subtitle, 160, 52, { width: 750 });

      // 3. Left Panel - Bullet Card Container
      doc.roundedRect(24, 90, 440, 395, 10).fill('#1e293b');
      doc.roundedRect(24, 90, 440, 395, 10).lineWidth(1).stroke('#334155');

      // Panel Header Label
      doc.roundedRect(36, 104, 150, 24, 4).fill('#0f172a');
      doc.fillColor('#60a5fa').fontSize(10).font('Helvetica-Bold')
         .text("KEY CONCEPTS", 46, 111);

      // Render Bullets inside Left Panel
      let startY = 142;
      slide.bullets.forEach((b, i) => {
        // Bullet Icon dot
        doc.circle(42, startY + 6, 4).fill('#3b82f6');

        // Bullet Card Background Box
        doc.roundedRect(54, startY - 4, 396, 52, 6).fill('#0f172a');
        doc.roundedRect(54, startY - 4, 396, 52, 6).lineWidth(0.5).stroke('#334155');

        doc.fillColor('#38bdf8').fontSize(10).font('Helvetica-Bold')
           .text(b.bold, 62, startY + 2, { width: 380, continued: true });
        doc.fillColor('#e2e8f0').fontSize(10).font('Helvetica')
           .text(b.text, { width: 380 });

        startY += 62;
      });

      // 4. Right Panel - Visual Diagram Graphics Container
      doc.roundedRect(480, 90, 456, 395, 10).fill('#090d16');
      doc.roundedRect(480, 90, 456, 395, 10).lineWidth(1).stroke('#334155');

      // Right Panel Header Badge
      doc.roundedRect(494, 104, 160, 24, 4).fill('#1e293b');
      doc.fillColor('#34d399').fontSize(10).font('Helvetica-Bold')
         .text("VISUAL DIAGRAM", 504, 111);

      // Draw custom vector graphics based on diagramType
      drawDiagram(doc, slide.diagramType);

      // 5. Footer Line & Meta
      doc.moveTo(24, 498).lineTo(936, 498).lineWidth(0.8).stroke('#334155');
      doc.fillColor('#64748b').fontSize(9).font('Helvetica')
         .text("EE/CS 101: Global Positioning System & Satellite Navigation", 24, 510);
      doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold')
         .text(`Slide ${slide.num} of 10`, 850, 510, { width: 86, align: 'right' });
    });

    doc.end();
  });
}

function drawDiagram(doc, type) {
  const cx = 708;
  const cy = 285;

  if (type === "orbit") {
    // Earth sphere
    doc.circle(cx, cy, 65).fill('#1e3a8a');
    doc.circle(cx, cy, 65).lineWidth(2).stroke('#60a5fa');
    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
       .text("EARTH", cx - 25, cy - 6);

    // Orbit ellipse
    doc.ellipse(cx, cy, 150, 80).lineWidth(1.5).dash(4, { space: 4 }).stroke('#38bdf8').undash();

    // Satellite 1
    doc.roundedRect(cx - 130, cy - 60, 28, 18, 4).fill('#3b82f6');
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text("SAT 1", cx - 128, cy - 55);
    doc.moveTo(cx - 116, cy - 42).lineTo(cx - 20, cy - 10).lineWidth(1).dash(2, { space: 2 }).stroke('#60a5fa').undash();

    // Satellite 2
    doc.roundedRect(cx + 100, cy - 50, 28, 18, 4).fill('#3b82f6');
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text("SAT 2", cx + 102, cy - 45);
    doc.moveTo(cx + 100, cy - 40).lineTo(cx + 20, cy - 10).lineWidth(1).dash(2, { space: 2 }).stroke('#60a5fa').undash();

    // Info Box
    doc.roundedRect(504, 385, 408, 80, 6).fill('#1e293b');
    doc.fillColor('#38bdf8').fontSize(11).font('Helvetica-Bold').text("Orbital Parameters:", 516, 395);
    doc.fillColor('#cbd5e1').fontSize(9).font('Helvetica').text("- Altitude: 20,200 km | Speed: 14,000 km/h\n- Orbit Period: 11 hours 58 minutes (2 orbits/day)\n- Inclination Angle: 55 degrees to Equator", 516, 412);

  } else if (type === "tof") {
    // Satellite Transmitter
    doc.roundedRect(510, 160, 110, 50, 6).fill('#1d4ed8');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text("Satellite Transmit\nt = t_sent", 518, 172);

    // Radio Wave Signal
    doc.moveTo(630, 185).lineTo(770, 185).lineWidth(2).stroke('#60a5fa');
    doc.circle(700, 185, 12).fill('#38bdf8');
    doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold').text("Radio Wave (c)", 665, 165);

    // Receiver
    doc.roundedRect(780, 160, 130, 50, 6).fill('#059669');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text("Smartphone Receive\nt = t_receive", 788, 172);

    // Equation Box
    doc.roundedRect(510, 250, 400, 120, 8).fill('#1e293b');
    doc.roundedRect(510, 250, 400, 120, 8).lineWidth(1).stroke('#3b82f6');
    doc.fillColor('#f8fafc').fontSize(14).font('Helvetica-Bold').text("Distance Formula:", 530, 268);
    doc.fillColor('#38bdf8').fontSize(16).font('Helvetica-Bold').text("d = c * ( t_receive - t_sent )", 530, 298);
    doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text("Where c = 299,792,458 m/s (Speed of Light)", 530, 332);

  } else if (type === "trilateration2d") {
    // 3 Intersecting Circles
    doc.circle(cx - 30, cy - 30, 75).lineWidth(1.5).stroke('#3b82f6');
    doc.circle(cx + 40, cy - 20, 70).lineWidth(1.5).stroke('#10b981');
    doc.circle(cx + 5, cy + 40, 65).lineWidth(1.5).stroke('#f59e0b');

    // Intersection Point
    doc.circle(cx + 5, cy - 5, 8).fill('#ef4444');
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text("Target (x, y)", cx + 18, cy - 9);

    // Info Box
    doc.roundedRect(504, 385, 408, 80, 6).fill('#1e293b');
    doc.fillColor('#f59e0b').fontSize(11).font('Helvetica-Bold').text("2D Intersection Logic:", 516, 395);
    doc.fillColor('#cbd5e1').fontSize(9).font('Helvetica').text("Blue Circle (Sat A) + Green Circle (Sat B) = 2 Intersections\nYellow Circle (Sat C) pinpoints the exact unique solution!", 516, 415);

  } else if (type === "relativity") {
    // Dilation Comparison Bar Graphic
    doc.roundedRect(510, 160, 396, 210, 8).fill('#1e293b');
    doc.fillColor('#f8fafc').fontSize(12).font('Helvetica-Bold').text("Relativistic Time Dilation Breakdown:", 525, 178);

    // Special Relativity Bar
    doc.rect(525, 210, 180, 26).fill('#ef4444');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text("Special Relativity: -7 us/day", 535, 218);

    // General Relativity Bar
    doc.rect(525, 250, 320, 26).fill('#10b981');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text("General Relativity: +45 us/day", 535, 258);

    // Net Result
    doc.roundedRect(525, 295, 366, 50, 6).fill('#0f172a');
    doc.roundedRect(525, 295, 366, 50, 6).lineWidth(1).stroke('#38bdf8');
    doc.fillColor('#38bdf8').fontSize(12).font('Helvetica-Bold').text("NET RESULT: +38 microseconds / day", 540, 308);
    doc.fillColor('#f1f5f9').fontSize(10).font('Helvetica').text("Drift without correction: 11.4 km error / day!", 540, 326);

  } else {
    // Generic Modern Graphic Container
    doc.roundedRect(510, 160, 396, 220, 8).fill('#1e293b');
    doc.roundedRect(510, 160, 396, 220, 8).lineWidth(1).stroke('#3b82f6');
    doc.fillColor('#38bdf8').fontSize(14).font('Helvetica-Bold').text("System Architecture & Signals", 530, 185);
    doc.fillColor('#e2e8f0').fontSize(11).font('Helvetica').text("High-precision satellite communication pipeline\noperating across L1 (1575.42 MHz) and L2 (1227.60 MHz)\nfrequency bands with Code Division Multiple Access (CDMA).", 530, 215, { width: 350 });

    doc.roundedRect(530, 290, 356, 70, 6).fill('#0f172a');
    doc.fillColor('#34d399').fontSize(11).font('Helvetica-Bold').text("Key Performance Metric:", 542, 302);
    doc.fillColor('#cbd5e1').fontSize(10).font('Helvetica').text("Standard GPS: 1.5 - 3.0 meters accuracy\nDGPS / RTK: 1.0 - 2.0 centimeters accuracy", 542, 322);
  }
}

buildGpsPdf().then(pdfBuf => {
  const b64 = pdfBuf.toString('base64');
  fs.writeFileSync('generated_pdf_b64.txt', b64);
  console.log('Successfully generated GPS PDF Base64! Length:', b64.length);
}).catch(err => console.error(err));
