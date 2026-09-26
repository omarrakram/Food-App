// Garment geometry for the stand-in renderer. Coordinates are in a
// 1000 x 1100 "garment space" (tee, shirt) or 1000 x 1000 (jorts).

(() => {
  const mirror = (pts) => pts.map(([x, y]) => [1000 - x, y]);

  // ---------------- NP-01 BOXY ----------------
  function teeOutline(ctx) {
    ctx.beginPath();
    ctx.moveTo(500, 80);
    ctx.quadraticCurveTo(440, 78, 392, 62);
    ctx.bezierCurveTo(320, 80, 230, 98, 166, 120);
    ctx.bezierCurveTo(118, 172, 70, 272, 30, 352);
    ctx.bezierCurveTo(62, 384, 100, 414, 138, 440);
    ctx.bezierCurveTo(160, 424, 186, 404, 208, 396);
    ctx.bezierCurveTo(202, 600, 212, 900, 204, 1042);
    ctx.quadraticCurveTo(350, 1050, 500, 1052);
    ctx.quadraticCurveTo(650, 1050, 796, 1042);
    ctx.bezierCurveTo(788, 900, 798, 600, 792, 396);
    ctx.bezierCurveTo(814, 404, 840, 424, 862, 440);
    ctx.bezierCurveTo(900, 414, 938, 384, 970, 352);
    ctx.bezierCurveTo(930, 272, 882, 172, 834, 120);
    ctx.bezierCurveTo(770, 98, 680, 80, 608, 62);
    ctx.quadraticCurveTo(560, 78, 500, 80);
    ctx.closePath();
    ctx.fill();
  }
  function teeFrontNeck(ctx) {
    ctx.moveTo(392, 62);
    ctx.bezierCurveTo(402, 128, 450, 156, 500, 157);
    ctx.bezierCurveTo(550, 156, 598, 128, 608, 62);
  }
  const tee = {
    size: [1000, 1100],
    silhouette: teeOutline,
    interior(ctx) {
      ctx.beginPath();
      ctx.moveTo(398, 70);
      ctx.quadraticCurveTo(440, 90, 500, 94);
      ctx.quadraticCurveTo(560, 90, 602, 70);
      ctx.bezierCurveTo(592, 118, 552, 136, 500, 137);
      ctx.bezierCurveTo(448, 136, 408, 118, 398, 70);
      ctx.fill();
    },
    raised(ctx) {
      ctx.lineWidth = 24;
      ctx.lineCap = 'round';
      ctx.beginPath();
      teeFrontNeck(ctx);
      ctx.stroke();
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(396, 66);
      ctx.quadraticCurveTo(440, 84, 500, 87);
      ctx.quadraticCurveTo(560, 84, 604, 66);
      ctx.stroke();
    },
    seams(ctx) {
      ctx.lineWidth = 2.4;
      // shoulder seams
      ctx.beginPath();
      ctx.moveTo(392, 64);
      ctx.bezierCurveTo(320, 82, 230, 100, 170, 122);
      ctx.moveTo(608, 64);
      ctx.bezierCurveTo(680, 82, 770, 100, 830, 122);
      // dropped armhole seams
      ctx.moveTo(170, 122);
      ctx.bezierCurveTo(190, 210, 214, 320, 210, 398);
      ctx.moveTo(830, 122);
      ctx.bezierCurveTo(810, 210, 786, 320, 790, 398);
      ctx.stroke();
      // double-needle hems
      ctx.lineWidth = 1.6;
      for (const off of [22, 30]) {
        ctx.beginPath();
        ctx.moveTo(206, 1042 - off);
        ctx.quadraticCurveTo(500, 1052 - off, 794, 1042 - off);
        ctx.stroke();
      }
      for (const off of [20, 27]) {
        const k = off / 130;
        ctx.beginPath();
        ctx.moveTo(30 + 105 * k * 0.9, 352 - 80 * k);
        ctx.lineTo(138 + 105 * k * 0.9, 440 - 80 * k);
        ctx.moveTo(970 - 105 * k * 0.9, 352 - 80 * k);
        ctx.lineTo(862 - 105 * k * 0.9, 440 - 80 * k);
        ctx.stroke();
      }
      // collar attach seam
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(382, 64);
      ctx.bezierCurveTo(390, 146, 446, 172, 500, 173);
      ctx.bezierCurveTo(554, 172, 610, 146, 618, 64);
      ctx.stroke();
    },
    folds: [
      { x1: 232, y1: 430, x2: 430, y2: 575, w: 24, a: -8 },
      { x1: 768, y1: 428, x2: 590, y2: 560, w: 28, a: -7 },
      { x1: 236, y1: 470, x2: 380, y2: 640, w: 14, a: 2.6 },
      { x1: 230, y1: 712, x2: 772, y2: 690, w: 64, a: 9 },
      { x1: 262, y1: 962, x2: 470, y2: 1004, w: 18, a: 3.4 },
      { x1: 540, y1: 994, x2: 772, y2: 948, w: 16, a: -2.8 },
      { x1: 168, y1: 144, x2: 70, y2: 336, w: 18, a: 3.2 },
      { x1: 832, y1: 150, x2: 940, y2: 330, w: 16, a: 2.4 },
      { x1: 110, y1: 300, x2: 150, y2: 410, w: 10, a: -2 },
      { x1: 470, y1: 210, x2: 452, y2: 520, w: 46, a: 2.2 },
      { x1: 398, y1: 178, x2: 324, y2: 268, w: 10, a: -2.2 },
      { x1: 620, y1: 190, x2: 700, y2: 300, w: 12, a: -1.6 },
      { x1: 300, y1: 820, x2: 480, y2: 880, w: 22, a: -2.2 },
      { x1: 600, y1: 800, x2: 720, y2: 860, w: 12, a: 1.8 },
    ],
    material: {
      color: '#1a1918',
      sheenColor: '#8c877f',
      sheen: 0.9,
      sheenPow: 1.1,
      ambient: 0.3,
      key: 1.05,
      texture: 'jersey',
      puff: 16,
      wrinkle: 8,
      wrinkleFreq: [0.0011, 0.0052],
      falloff: 0.9,
      lightPos: [0.15, 0.05],
      raise: 3.2,
      raisedTexture: 'rib',
      ribCenter: [500, 40],
      ribCount: 380,
      interiorDark: 0.45,
      cavity: 0.1,
    },
  };

  // ---------------- NP-109 LINEN ----------------
  function shirtOutline(ctx) {
    ctx.beginPath();
    ctx.moveTo(500, 58);
    ctx.quadraticCurveTo(440, 56, 392, 60);
    ctx.bezierCurveTo(320, 82, 236, 100, 176, 124);
    ctx.bezierCurveTo(130, 176, 88, 270, 56, 350);
    ctx.bezierCurveTo(90, 378, 124, 402, 160, 426);
    ctx.bezierCurveTo(176, 414, 196, 402, 214, 396);
    ctx.bezierCurveTo(206, 600, 214, 900, 206, 1046);
    ctx.quadraticCurveTo(350, 1052, 500, 1054);
    ctx.quadraticCurveTo(650, 1052, 794, 1046);
    ctx.bezierCurveTo(786, 900, 794, 600, 786, 396);
    ctx.bezierCurveTo(804, 402, 824, 414, 840, 426);
    ctx.bezierCurveTo(876, 402, 910, 378, 944, 350);
    ctx.bezierCurveTo(912, 270, 870, 176, 824, 124);
    ctx.bezierCurveTo(764, 100, 680, 82, 608, 60);
    ctx.quadraticCurveTo(560, 56, 500, 58);
    ctx.closePath();
    ctx.fill();
  }
  const collarL = [
    [436, 64],
    [372, 66],
    [300, 104],
    [286, 136],
    [356, 300],
    [498, 342],
    [470, 262],
    [444, 150],
  ];
  const poly = (ctx, pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  };
  const shirt = {
    size: [1000, 1100],
    silhouette: shirtOutline,
    interior(ctx) {
      ctx.beginPath();
      ctx.moveTo(444, 90);
      ctx.quadraticCurveTo(500, 104, 556, 90);
      ctx.lineTo(530, 262);
      ctx.lineTo(500, 336);
      ctx.lineTo(470, 262);
      ctx.closePath();
      ctx.fill();
    },
    raised(ctx) {
      poly(ctx, collarL);
      poly(ctx, mirror(collarL));
      // chest pocket
      ctx.globalAlpha = 0.5;
      ctx.fillRect(598, 420, 132, 150);
      ctx.globalAlpha = 1;
    },
    seams(ctx) {
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      // collar edges
      for (const pts of [collarL, mirror(collarL)]) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
      }
      // placket
      ctx.moveTo(482, 344);
      ctx.lineTo(484, 1048);
      ctx.moveTo(522, 344);
      ctx.lineTo(522, 1048);
      // shoulder + armhole
      ctx.moveTo(300, 90);
      ctx.bezierCurveTo(260, 104, 220, 114, 180, 126);
      ctx.moveTo(700, 90);
      ctx.bezierCurveTo(740, 104, 780, 114, 820, 126);
      ctx.moveTo(180, 126);
      ctx.bezierCurveTo(198, 210, 220, 320, 216, 398);
      ctx.moveTo(820, 126);
      ctx.bezierCurveTo(802, 210, 780, 320, 784, 398);
      ctx.stroke();
      // pocket
      ctx.strokeRect(598, 420, 132, 150);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(206, 1024);
      ctx.quadraticCurveTo(500, 1034, 794, 1024);
      ctx.moveTo(56 + 22, 350 - 24);
      ctx.lineTo(160 + 22, 426 - 24);
      ctx.moveTo(944 - 22, 350 - 24);
      ctx.lineTo(840 - 22, 426 - 24);
      ctx.stroke();
    },
    bumps(ctx) {
      for (const y of [428, 566, 704, 842, 980]) {
        ctx.beginPath();
        ctx.arc(503, y, 10.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    folds: (() => {
      const f = [
        { x1: 240, y1: 440, x2: 420, y2: 600, w: 26, a: -3.6 },
        { x1: 762, y1: 430, x2: 600, y2: 580, w: 24, a: -2.8 },
        { x1: 220, y1: 740, x2: 780, y2: 716, w: 70, a: 4.4 },
        { x1: 180, y1: 150, x2: 90, y2: 330, w: 18, a: 3 },
        { x1: 822, y1: 150, x2: 920, y2: 330, w: 16, a: 2.6 },
        { x1: 300, y1: 360, x2: 420, y2: 380, w: 12, a: 2 },
      ];
      let seed = 11;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 26; i++) {
        const x = 230 + r() * 540;
        const y = 180 + r() * 840;
        const ang = (r() - 0.5) * 1.6 + (r() > 0.5 ? 0 : Math.PI / 2) * 0.4;
        const len = 40 + r() * 110;
        f.push({
          x1: x,
          y1: y,
          x2: x + Math.cos(ang) * len,
          y2: y + Math.sin(ang) * len,
          w: 5 + r() * 9,
          a: (r() - 0.45) * 5,
        });
      }
      return f;
    })(),
    material: {
      color: '#c7b394',
      sheenColor: '#e4dccb',
      sheen: 0.18,
      ambient: 0.34,
      key: 0.85,
      texture: 'linen',
      puff: 12,
      wrinkle: 7,
      wrinklePow: 7,
      wrinkleFreq: [0.0018, 0.0095],
      falloff: 0.8,
      lightPos: [0.15, 0.05],
      raise: 4.5,
      seamDepth: 2.6,
      bumpHeight: 3.5,
      bumpColor: '#e9e3d6',
      interiorDark: 0.32,
      cavity: 0.12,
      midNoise: 4,
    },
  };

  // ---------------- NP-98 JORTS ----------------
  function jortsOutline(ctx) {
    ctx.beginPath();
    ctx.moveTo(205, 60);
    ctx.quadraticCurveTo(500, 50, 795, 60);
    ctx.bezierCurveTo(812, 150, 834, 240, 842, 330);
    ctx.bezierCurveTo(856, 520, 872, 760, 884, 902);
    ctx.quadraticCurveTo(712, 926, 548, 934);
    ctx.bezierCurveTo(540, 800, 524, 680, 506, 604);
    ctx.lineTo(494, 604);
    ctx.bezierCurveTo(476, 680, 460, 800, 452, 934);
    ctx.quadraticCurveTo(288, 926, 116, 902);
    ctx.bezierCurveTo(128, 760, 144, 520, 158, 330);
    ctx.bezierCurveTo(166, 240, 188, 150, 205, 60);
    ctx.closePath();
    ctx.fill();
  }
  const jorts = {
    size: [1000, 1000],
    silhouette: jortsOutline,
    raised(ctx) {
      ctx.beginPath();
      ctx.moveTo(205, 60);
      ctx.quadraticCurveTo(500, 50, 795, 60);
      ctx.lineTo(808, 130);
      ctx.quadraticCurveTo(500, 122, 192, 130);
      ctx.closePath();
      ctx.fill();
      for (const x of [238, 384, 616, 762]) ctx.fillRect(x - 12, 48, 24, 104);
    },
    seams(ctx) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(192, 131);
      ctx.quadraticCurveTo(500, 123, 808, 131);
      // pockets
      ctx.moveTo(262, 132);
      ctx.bezierCurveTo(262, 230, 214, 300, 156, 336);
      ctx.moveTo(738, 132);
      ctx.bezierCurveTo(738, 230, 786, 300, 844, 336);
      // fly
      ctx.moveTo(566, 132);
      ctx.lineTo(566, 470);
      ctx.bezierCurveTo(566, 530, 540, 560, 500, 590);
      ctx.moveTo(500, 132);
      ctx.lineTo(500, 600);
      // hem
      ctx.moveTo(120, 872);
      ctx.quadraticCurveTo(288, 896, 454, 904);
      ctx.moveTo(546, 904);
      ctx.quadraticCurveTo(712, 896, 880, 872);
      // coin pocket
      ctx.moveTo(646, 138);
      ctx.lineTo(646, 232);
      ctx.lineTo(724, 232);
      ctx.lineTo(724, 138);
      ctx.stroke();
    },
    stitches(ctx) {
      ctx.lineWidth = 2.2;
      ctx.setLineDash([9, 5]);
      ctx.beginPath();
      for (const o of [-8, 8]) {
        ctx.moveTo(192, 131 + o);
        ctx.quadraticCurveTo(500, 123 + o, 808, 131 + o);
      }
      for (const o of [10, 20]) {
        ctx.moveTo(262 + o, 132);
        ctx.bezierCurveTo(262 + o, 238, 214 + o, 312, 158 + o * 0.4, 348 + o);
        ctx.moveTo(738 - o, 132);
        ctx.bezierCurveTo(738 - o, 238, 786 - o, 312, 842 - o * 0.4, 348 + o);
      }
      for (const o of [0, 11]) {
        ctx.moveTo(578 + o, 140);
        ctx.lineTo(578 + o, 470);
        ctx.bezierCurveTo(578 + o, 540, 548 + o, 574, 505, 604 + o);
      }
      ctx.moveTo(656, 140);
      ctx.lineTo(656, 222);
      ctx.lineTo(714, 222);
      ctx.lineTo(714, 140);
      ctx.moveTo(508, 140);
      ctx.lineTo(508, 590);
      ctx.moveTo(124, 862);
      ctx.quadraticCurveTo(288, 886, 452, 894);
      ctx.moveTo(548, 894);
      ctx.quadraticCurveTo(712, 886, 876, 862);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    bumps(ctx) {
      ctx.beginPath();
      ctx.arc(532, 94, 17, 0, Math.PI * 2);
      for (const [x, y] of [
        [268, 142],
        [732, 142],
        [646, 146],
        [724, 146],
      ]) {
        ctx.moveTo(x + 7, y);
        ctx.arc(x, y, 7, 0, Math.PI * 2);
      }
      ctx.fill();
    },
    fray(ctx) {
      let seed = 5;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const hem = (x) =>
        x < 500 ? 902 + ((x - 116) / (452 - 116)) * 32 : 934 - ((x - 548) / (884 - 548)) * 32;
      for (let i = 0; i < 520; i++) {
        let x = 118 + r() * 764;
        if (x > 452 && x < 548) continue;
        const y = hem(x) - 6;
        const len = 8 + Math.pow(r(), 2) * 46;
        const dx = (r() - 0.5) * 10;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + dx * 0.3, y + len * 0.6, x + dx, y + len);
      }
      ctx.stroke();
    },
    folds: [
      { x1: 440, y1: 300, x2: 330, y2: 330, w: 8, a: 4.5 },
      { x1: 446, y1: 350, x2: 320, y2: 392, w: 8, a: 4 },
      { x1: 450, y1: 400, x2: 340, y2: 452, w: 7, a: 3.4 },
      { x1: 560, y1: 300, x2: 670, y2: 330, w: 8, a: 4.2 },
      { x1: 556, y1: 352, x2: 690, y2: 390, w: 8, a: 3.8 },
      { x1: 552, y1: 404, x2: 660, y2: 452, w: 7, a: 3 },
      { x1: 300, y1: 520, x2: 280, y2: 860, w: 30, a: 5 },
      { x1: 700, y1: 520, x2: 720, y2: 860, w: 34, a: 4.4 },
      { x1: 180, y1: 600, x2: 420, y2: 640, w: 16, a: -2.8 },
      { x1: 580, y1: 640, x2: 820, y2: 610, w: 16, a: -2.6 },
      { x1: 240, y1: 760, x2: 410, y2: 790, w: 10, a: 3 },
      { x1: 600, y1: 790, x2: 780, y2: 760, w: 10, a: 2.6 },
    ],
    material: {
      color: '#15223b',
      altColor: '#5f779a',
      wrinkle: 5,
      wrinkleFreq: [0.0014, 0.0075],
      falloff: 0.8,
      lightPos: [0.15, 0.05],
      stitchColor: '#c68a4c',
      sheenColor: '#8ea0bb',
      sheen: 0.14,
      ambient: 0.36,
      key: 0.8,
      texture: 'denim',
      puff: 12,
      raise: 4,
      seamDepth: 3,
      bumpHeight: 5,
      bumpColor: '#8f7a5e',
      frayColor: '#c2c4c4',
      cavity: 0.1,
    },
  };

  window.NPGarments = { tee, shirt, jorts };
})();
