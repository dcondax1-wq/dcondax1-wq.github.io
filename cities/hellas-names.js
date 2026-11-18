// HELLAS names: real places of the ancient Greek world (poleis, islands, sanctuaries). A polis gets one of these plus its data label,
// e.g. "Thebes · VWAP confluence, 41 runs". Pure data. "Athens" is kept for the capital.
const RAW = `Sparta Corinth Thebes Argos Mycenae Olympia Delphi Megara Chalcis Eretria Miletus Ephesus Smyrna Halicarnassus Knossos Phaistos Gortyn
Rhodes Lindos Kameiros Ialysos Kos Samos Chios Mytilene Methymna Naxos Paros Delos Mykonos Tenos Andros Syros Melos Thera Ios Sifnos Serifos
Kythnos Keos Amorgos Anaphe Astypalaia Karpathos Kasos Nisyros Telos Syme Kalymnos Leros Patmos Ikaria Lemnos Imbros Samothrace Thasos Skyros
Skiathos Skopelos Aegina Salamis Poros Hydra Kythera Zakynthos Kephallenia Ithaca Leukas Corcyra Paxos Pylos Messene Methone Korone Kyparissia
Tegea Mantinea Orchomenos Megalopolis Elis Patrae Aigion Sikyon Phlius Nemea Tiryns Nauplia Epidauros Troezen Hermione Gythion Amyclae Tainaron
Monemvasia Plataea Thespiae Tanagra Haliartos Koroneia Lebadeia Chaeronea Aulis Anthedon Oropos Eleusis Marathon Rhamnous Sounion Brauron
Thorikos Laurion Piraeus Phaleron Acharnae Dekeleia Phyle Larissa Pharsalos Pherae Iolkos Demetrias Trikka Krannon Lamia Thermopylae Herakleia
Amphissa Naupaktos Kirrha Krisa Elateia Abae Opous Thronion Stratos Ambracia Dodona Nikopolis Apollonia Epidamnos Bouthroton Kassope Ephyra
Pella Aigai Dion Pydna Beroia Edessa Amphipolis Philippi Olynthos Potidaea Torone Mende Skione Akanthos Stageira Neapolis Abdera Maroneia Ainos
Perinthos Byzantion Chalcedon Selymbria Sestos Abydos Lampsakos Kyzikos Ilion Assos Pergamon Kyme Phokaia Klazomenai Erythrai Teos Lebedos
Kolophon Priene Myous Magnesia Tralles Sardis Didyma Iasos Mylasa Knidos Kaunos Telmessos Xanthos Patara Myra Phaselis Side Aspendos Perge
Kydonia Aptera Eleutherna Lyttos Lato Itanos Hierapytna Praisos Polyrrhenia Lappa Axos Rhithymna Chersonesos Malia Zakros Karystos Histiaia
Kerinthos Styra Oreos Syracuse Akragas Gela Selinous Himera Katane Messana Rhegion Kroton Sybaris Taras Metapontion Elea Poseidonia Massalia
Emporion Kyrene Naukratis Sinope Trapezous Amisos Olbia Pantikapaion Tomis Istros Odessos Mesembria Paphos Kition Amathous Kourion Soloi Marion
Lapethos Tamassos Idalion Kalydon Pleuron Thermon Oiniadai Leuktra Askra Thisbe Kreusis Pagai Aigosthena Nisaia Kenchreai Lechaion Kleonai
Orneai Asine Lerna Thyrea Prasiai Sellasia Karyai Pellana Gerenia Kardamyle Thouria Pharai Dyme Pellene Aigeira Boura Helike Kleitor Pheneos
Stymphalos Psophis Heraia Phigaleia Lykosoura Gortys Alipheira Lepreon Skillous Pisa Kyllene Antikyra Daulis Panopeus Hyampolis Tithorea
Lilaia Skarpheia Alope Larymna Kopai Akraiphia Onchestos Mykalessos Hyria Eleutherai Oinoe Aphidna Trikorythos Probalinthos Prasiai Anaphlystos
Lamptrai Halai Myrrhinous Paiania Kephisia Pallene Gargettos Sphettos Kolonos Alopeke Melite Kollytos`;
export const PLACES = [...new Set(RAW.split(/\s+/).filter(Boolean))];

// The regions of the map: where each data source lives. x grows east, z grows south; one unit is about one stadion on the world map.
// kind 'land' = one green landmass, 'isles' = every polis sits on its own small island, 'desert' = one landmass of sand and dunes.
export const REGIONS = [
  { key: 'attica', name: 'Attica', x: 70, z: 80, kind: 'land', tint: '#c8a24a', blurb: 'Athens, the capital, with the apps, the accounts and the live strategy' },
  { key: 'peloponnese', name: 'Peloponnese', x: -330, z: 330, kind: 'land', tint: '#b9603f', blurb: 'LIT research: every version of the live strategy that was tested' },
  { key: 'boeotia', name: 'Boeotia', x: -190, z: -110, kind: 'land', tint: '#9c6b3c', blurb: 'Other tests and baselines from the Archive' },
  { key: 'thessaly', name: 'Thessaly', x: -230, z: -420, kind: 'land', tint: '#7f8a52', blurb: 'Risk and sizing tests from the Archive' },
  { key: 'macedonia', name: 'Macedonia', x: -120, z: -790, kind: 'land', tint: '#8f8a5c', blurb: 'Filter tests from the Archive' },
  { key: 'epirus', name: 'Epirus', x: -610, z: -330, kind: 'land', tint: '#a08a66', blurb: 'Trade management tests from the Archive' },
  { key: 'thrace', name: 'Thrace', x: 380, z: -800, kind: 'land', tint: '#a8875a', blurb: 'Session and timing tests from the Archive' },
  { key: 'euboea', name: 'Euboea', x: 190, z: -260, kind: 'land', tint: '#b08a4a', blurb: 'ATLAS, the second strategy, from the Archive' },
  { key: 'ionian', name: 'Ionian Islands', x: -760, z: 120, kind: 'isles', tint: '#4b7a99', blurb: 'Targets, stops, bias and win-rate tests from the Archive' },
  { key: 'ionia', name: 'Ionia', x: 800, z: -60, kind: 'land', tint: '#c98a5a', blurb: 'Data City: times, the week and the seasons' },
  { key: 'aeolis', name: 'Aeolis', x: 770, z: -520, kind: 'land', tint: '#b57a6a', blurb: 'Data City: volatility and gaps' },
  { key: 'caria', name: 'Caria', x: 820, z: 420, kind: 'land', tint: '#b99a5a', blurb: 'Data City: the opening range, confluences and ES against NQ' },
  { key: 'crete', name: 'Crete', x: 120, z: 880, kind: 'land', tint: '#c96a4a', blurb: 'Kalshi: one city per strategy and per market' },
  { key: 'cyclades', name: 'Cyclades', x: 330, z: 430, kind: 'isles', tint: '#4b7a99', blurb: 'Kalshi: price bands, hours, sides and the suggestions' },
  { key: 'dodecanese', name: 'Dodecanese', x: 640, z: 800, kind: 'isles', tint: '#7fa0b0', blurb: 'The money machines' },
  // the desert of what did not work: every city here is a ghost town of rejected runs (you can still enter and read why)
  { key: 'libya', name: 'Libya', x: -620, z: 1480, kind: 'desert', tint: '#d9b878', blurb: 'The desert of what did not work: rejected filter, management, stop and target tests' },
  { key: 'egypt', name: 'Egypt', x: 150, z: 1560, kind: 'desert', tint: '#e0c080', blurb: 'The desert of what did not work: rejected LIT and ATLAS versions' },
  { key: 'persia', name: 'Persia', x: 980, z: 1480, kind: 'desert', tint: '#d6ab6e', blurb: 'The desert of what did not work: rejected risk, session and timing tests' },
];
