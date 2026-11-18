// Static SVG: broad stepped bowl, vaulted galleries, imperial banners, torch pools and central altar.
// No user data is interpolated. This illustration never substitutes progress or earned rewards.
export function illustratedColosseum() {
  const stars = Array.from({ length: 44 }, (_, i) => `<circle cx="${(i * 167 + 43) % 1200}" cy="${40 + (i * 89) % 370}" r="${i % 5 ? 1 : 1.8}"/>`).join('');
  const arcades = [0, 1, 2].map((tier) => {
    const y = 350 + tier * 55, width = 1150 - tier * 110, start = (1200 - width) / 2;
    const arches = Array.from({ length: 24 - tier * 2 }, (_, i) => `<use href="#arena-arch" x="${start + i * width / (24 - tier * 2)}" y="${y}" width="${width / (24 - tier * 2) - 3}" height="52"/>`).join('');
    return `<g opacity="${0.6 + tier * 0.15}"><path d="M${start} ${y + 54}Q600 ${y + 120} ${1200 - start} ${y + 54}" fill="none" stroke="#e0a060" stroke-width="3"/>${arches}</g>`;
  }).join('');
  const banners = [240, 420, 750, 930].map((x) => `<g transform="translate(${x} 377)"><path d="M-15 0H15V78L0 92 -15 78Z" fill="#533b2d" stroke="#c8a24a"/><path d="M-8 8H8V73L0 80 -8 73Z" fill="none" stroke="#c8a24a" stroke-width=".7"/><text y="49" text-anchor="middle" fill="#c8a24a" font-size="24" font-family="serif">Α</text></g>`).join('');
  const torch = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cy="18" rx="53" ry="30" fill="url(#arena-fire-pool)"/><path d="M-5 8L-3 55H3L5 8" fill="#493e32" stroke="#e0a060"/><path d="M-9 0Q-18 -16 0 -39Q-2 -20 8 -17Q18 -6 9 0Z" fill="#e0a060"/><path d="M-4 -3Q-8 -15 2 -26Q0 -13 7 -7L4 1Z" fill="#f0dca0"/></g>`;
  return `<svg viewBox="0 0 1200 850" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="arena-sky" x2="0" y2="1"><stop stop-color="#130f0a"/><stop offset=".55" stop-color="#282118"/><stop offset="1" stop-color="#100d09"/></linearGradient>
    <linearGradient id="arena-stone" x2="0" y2="1"><stop stop-color="#aea69c"/><stop offset=".18" stop-color="#675b4e"/><stop offset="1" stop-color="#28211a"/></linearGradient>
    <radialGradient id="arena-ground"><stop stop-color="#e0a060" stop-opacity=".62"/><stop offset=".55" stop-color="#604224" stop-opacity=".45"/><stop offset="1" stop-color="#1f1a15"/></radialGradient>
    <radialGradient id="arena-fire-pool"><stop stop-color="#e0a060" stop-opacity=".45"/><stop offset="1" stop-color="#e0a060" stop-opacity="0"/></radialGradient>
    <radialGradient id="arena-aura"><stop stop-color="#e0a060" stop-opacity=".25"/><stop offset="1" stop-color="#e0a060" stop-opacity="0"/></radialGradient>
    <symbol id="arena-arch" viewBox="0 0 36 52"><path d="M1 51V2H35V51H28V23Q18 0 8 23V51Z" fill="url(#arena-stone)" stroke="#e0a060" stroke-width=".7"/><path d="M0 2H36" stroke="#e0a060" stroke-width="2"/></symbol>
  </defs>
  <rect width="1200" height="850" fill="url(#arena-sky)"/><g fill="#6f9bb8" opacity=".55">${stars}</g>
  <circle cx="930" cy="220" r="90" fill="url(#arena-aura)"/><circle cx="930" cy="220" r="27" fill="#d7d3cf" opacity=".78"/><circle cx="940" cy="214" r="26" fill="#241e17"/>
  <g fill="#221c16" stroke="#7d6b56" stroke-width=".6"><path d="M0 395V270H28V250H48V310H88V236H116V290H148V215H178V250H204V380ZM1000 380V250H1025V220H1050V290H1093V210H1115V265H1158V240H1180V275H1200V395Z"/></g>
  <path d="M0 390Q600 455 1200 390V620Q600 780 0 620Z" fill="#2b241d" stroke="#b0763c"/>
  ${arcades}${banners}
  <ellipse cx="600" cy="634" rx="540" ry="150" fill="none" stroke="#736351" stroke-width="12"/>
  <ellipse cx="600" cy="639" rx="485" ry="129" fill="none" stroke="#4b433a" stroke-width="18"/>
  <ellipse cx="600" cy="646" rx="425" ry="109" fill="none" stroke="#b0763c" stroke-width="5"/>
  <ellipse cx="600" cy="653" rx="395" ry="100" fill="url(#arena-ground)" stroke="#e0a060" stroke-width="1.5"/>
  <g fill="none" stroke="#e0a060" opacity=".23"><ellipse cx="600" cy="650" rx="300" ry="76"/><path d="M205 653H995M600 553V753M350 579L850 729M850 579L350 729"/></g>
  <ellipse cx="600" cy="622" rx="180" ry="175" fill="url(#arena-aura)"/>
  <g stroke="#e0a060" fill="url(#arena-stone)"><path d="M504 657L600 630 696 657 600 691Z"/><path d="M521 641L600 619 679 641 600 669Z"/><path d="M541 624L600 607 659 624 600 645Z"/><path d="M562 607L600 596 638 607 600 620Z"/></g>
  <path d="M594 605L578 465H622L606 605Z" fill="#e0a060" opacity=".12"/><g fill="none" stroke="#f0dca0" stroke-width="3"><ellipse cx="600" cy="476" rx="30" ry="12"/><path d="M571 476L567 456 584 466 600 447 616 466 633 456 629 476"/></g>
  ${torch(224, 594)}${torch(372, 701)}${torch(828, 701)}${torch(976, 594)}
  <path d="M0 775Q600 865 1200 775V850H0Z" fill="#100d09"/>
  </svg>`;
}

