// The normalized GamID platforms and how Wikidata's platform items map onto them. This file is the SINGLE source of truth for both the import transform and the
// platform seed of the catalog migrations (tests/game-catalog-platforms.test.js asserts the migration seeds exactly these keys, names and families).
//
// Rules
//   * One real system = ONE normalized key, however many Wikidata items name it (regional names, duplicate items, variants of the same console): all of them
//     are listed in `qids` and resolve to the same key.
//   * A platform value that is not listed is ignored by the transform, never re-mapped to something else. Generic or non-platform values (a CPU, "cross-platform",
//     "mainframe computer", a Java virtual machine ...) are deliberately NOT mapped.
//   * Keys are stable, predictable and provider-neutral (no store, no vendor account): pc / steam / epic_games keep their accepted meaning (Steam and Epic are
//     stores UNDER PC; a store identifier proves the store and its PC context, see wikidata-catalog.mjs).
//   * `sort` groups a family together and keeps each family in release order.
//   * Families: PC (every computer platform), PLAYSTATION, XBOX, NINTENDO, SEGA, ATARI (Atari consoles and handhelds), NEC, SNK, MOBILE, OTHER.
//
// `aliases` are the other names people and data sources use for the same system; they are used to recognise a duplicate Wikidata item by its label during the
// platform audit (platformKeyForLabel) and are documentation of the intended resolution.
export const PLATFORMS = Object.freeze([
  // ---- computers ------------------------------------------------------------------------------------------------------------------------------------------
  { key: "pc", name: "PC", family: "PC", sort: 110, qids: ["Q1406", "Q737508", "Q609733", "Q21600523", "Q16338", "Q751046", "Q202712", "Q1419081", "Q190685"], aliases: ["windows", "microsoft windows", "pc", "personal computer", "ibm pc compatible", "windows 3.x", "windows 9x", "universal windows platform"] },
  { key: "steam", name: "Steam", family: "PC", sort: 111, qids: ["Q337535"], aliases: ["steam"] },
  { key: "epic_games", name: "Epic Games Store", family: "PC", sort: 112, qids: [], aliases: ["epic games store"] },
  { key: "macos", name: "macOS", family: "PC", sort: 120, qids: ["Q14116", "Q43627", "Q75687"], aliases: ["macos", "mac os x", "os x", "mac", "mac operating system"] },
  { key: "classic_mac_os", name: "Classic Mac OS", family: "PC", sort: 121, qids: ["Q13522376", "Q420384"], aliases: ["classic mac os", "mac os classic", "system 7"] },
  { key: "linux", name: "Linux", family: "PC", sort: 130, qids: ["Q388"], aliases: ["linux", "gnu/linux"] },
  { key: "dos", name: "DOS", family: "PC", sort: 140, qids: ["Q170434", "Q47604"], aliases: ["dos", "ms-dos", "pc dos"] },
  { key: "commodore_64", name: "Commodore 64", family: "PC", sort: 150, qids: ["Q99775"], aliases: ["commodore 64", "c64"] },
  { key: "vic_20", name: "Commodore VIC-20", family: "PC", sort: 151, qids: ["Q918232"], aliases: ["vic-20", "commodore vic-20"] },
  { key: "amiga", name: "Amiga", family: "PC", sort: 152, qids: ["Q100047", "Q471094", "Q380526"], aliases: ["amiga", "commodore amiga", "amiga 1200", "amigaos"] },
  { key: "atari_st", name: "Atari ST", family: "PC", sort: 153, qids: ["Q627302"], aliases: ["atari st"] },
  { key: "atari_8bit", name: "Atari 8-bit", family: "PC", sort: 154, qids: ["Q249075", "Q3306898", "Q4889765"], aliases: ["atari 8-bit family", "atari 400", "atari 800"] },
  { key: "zx_spectrum", name: "ZX Spectrum", family: "PC", sort: 155, qids: ["Q23882"], aliases: ["zx spectrum", "sinclair zx spectrum"] },
  { key: "amstrad_cpc", name: "Amstrad CPC", family: "PC", sort: 156, qids: ["Q478829"], aliases: ["amstrad cpc"] },
  { key: "msx", name: "MSX", family: "PC", sort: 157, qids: ["Q853547", "Q11232203"], aliases: ["msx", "msx2", "msx 2"] },
  { key: "apple_ii", name: "Apple II", family: "PC", sort: 158, qids: ["Q201652", "Q1282269", "Q3017175"], aliases: ["apple ii", "apple iigs", "apple ii series"] },
  { key: "bbc_micro", name: "BBC Micro", family: "PC", sort: 159, qids: ["Q749976"], aliases: ["bbc micro"] },
  { key: "acorn_archimedes", name: "Acorn Archimedes", family: "PC", sort: 160, qids: ["Q41357"], aliases: ["acorn archimedes"] },
  { key: "pc_9800", name: "NEC PC-9800", family: "PC", sort: 161, qids: ["Q183505", "Q844362"], aliases: ["nec pc-9800 series", "pc-98"] },
  { key: "pc_8800", name: "NEC PC-8800", family: "PC", sort: 162, qids: ["Q1338888"], aliases: ["nec pc-8800 series", "pc-88"] },
  { key: "x68000", name: "Sharp X68000", family: "PC", sort: 163, qids: ["Q1758277"], aliases: ["sharp x68000", "x68000"] },
  { key: "fm_towns", name: "FM Towns", family: "PC", sort: 164, qids: ["Q531896"], aliases: ["fm towns"] },
  { key: "fm_7", name: "Fujitsu FM-7", family: "PC", sort: 165, qids: ["Q2379925"], aliases: ["fm-7"] },
  { key: "sharp_x1", name: "Sharp X1", family: "PC", sort: 166, qids: ["Q2710884"], aliases: ["sharp x1"] },
  { key: "ti_99_4a", name: "TI-99/4A", family: "PC", sort: 167, qids: ["Q454390"], aliases: ["texas instruments ti-99/4a", "ti-99/4a"] },
  { key: "trs_80", name: "TRS-80", family: "PC", sort: 168, qids: ["Q610305", "Q14523564"], aliases: ["trs-80", "trs-80 model i"] },
  { key: "trs_80_coco", name: "TRS-80 Color Computer", family: "PC", sort: 169, qids: ["Q1411846"], aliases: ["trs-80 color computer", "tandy color computer", "coco"] },
  { key: "amstrad_pcw", name: "Amstrad PCW", family: "PC", sort: 170, qids: ["Q478833"], aliases: ["amstrad pcw"] },
  { key: "acorn_electron", name: "Acorn Electron", family: "PC", sort: 171, qids: ["Q342163"], aliases: ["acorn electron"] },
  { key: "dragon_32", name: "Dragon 32/64", family: "PC", sort: 172, qids: ["Q1238768", "Q57741692"], aliases: ["dragon 32/64", "dragon 32", "dragon 64"] },
  { key: "commodore_128", name: "Commodore 128", family: "PC", sort: 173, qids: ["Q1115919"], aliases: ["commodore 128", "c128"] },
  { key: "commodore_plus4", name: "Commodore Plus/4", family: "PC", sort: 174, qids: ["Q868568"], aliases: ["commodore plus/4", "plus/4"] },
  { key: "commodore_pet", name: "Commodore PET", family: "PC", sort: 175, qids: ["Q946661"], aliases: ["commodore pet", "pet"] },
  { key: "commodore_16", name: "Commodore 16", family: "PC", sort: 176, qids: ["Q1115913"], aliases: ["commodore 16", "c16"] },
  { key: "thomson_mo5", name: "Thomson MO5", family: "PC", sort: 177, qids: ["Q2396081"], aliases: ["thomson mo5", "mo5"] },

  // ---- PlayStation ---------------------------------------------------------------------------------------------------------------------------------------
  { key: "ps1", name: "PlayStation (PS1)", family: "PLAYSTATION", sort: 210, qids: ["Q10677"], aliases: ["playstation", "ps1", "psx", "ps one", "playstation 1", "sony playstation"] },
  { key: "ps2", name: "PlayStation 2", family: "PLAYSTATION", sort: 220, qids: ["Q10680", "Q137982318"], aliases: ["playstation 2", "ps2"] },
  { key: "ps3", name: "PlayStation 3", family: "PLAYSTATION", sort: 230, qids: ["Q10683"], aliases: ["playstation 3", "ps3"] },
  { key: "ps4", name: "PlayStation 4", family: "PLAYSTATION", sort: 240, qids: ["Q5014725"], aliases: ["playstation 4", "ps4"] },
  { key: "ps5", name: "PlayStation 5", family: "PLAYSTATION", sort: 250, qids: ["Q63184502"], aliases: ["playstation 5", "ps5"] },
  { key: "psp", name: "PlayStation Portable (PSP)", family: "PLAYSTATION", sort: 260, qids: ["Q170325"], aliases: ["playstation portable", "psp"] },
  { key: "ps_vita", name: "PlayStation Vita", family: "PLAYSTATION", sort: 270, qids: ["Q188808"], aliases: ["playstation vita", "ps vita", "psvita", "vita"] },

  // ---- Xbox ----------------------------------------------------------------------------------------------------------------------------------------------
  { key: "xbox", name: "Xbox (original)", family: "XBOX", sort: 310, qids: ["Q132020"], aliases: ["xbox", "original xbox"] },
  { key: "xbox_360", name: "Xbox 360", family: "XBOX", sort: 320, qids: ["Q48263"], aliases: ["xbox 360"] },
  { key: "xbox_one", name: "Xbox One", family: "XBOX", sort: 330, qids: ["Q13361286"], aliases: ["xbox one"] },
  { key: "xbox_series", name: "Xbox Series X|S", family: "XBOX", sort: 340, qids: ["Q98973368"], aliases: ["xbox series x and series s", "xbox series x|s", "xbox series x", "xbox series s"] },

  // ---- Nintendo -----------------------------------------------------------------------------------------------------------------------------------------
  { key: "nes", name: "Nintendo Entertainment System (NES)", family: "NINTENDO", sort: 410, qids: ["Q172742", "Q135321", "Q491640"], aliases: ["nintendo entertainment system", "nes", "famicom", "family computer", "famicom disk system"] },
  { key: "snes", name: "Super Nintendo (SNES)", family: "NINTENDO", sort: 420, qids: ["Q183259"], aliases: ["super nintendo entertainment system", "snes", "super famicom", "super nes"] },
  { key: "n64", name: "Nintendo 64", family: "NINTENDO", sort: 430, qids: ["Q184839"], aliases: ["nintendo 64", "n64"] },
  { key: "gamecube", name: "Nintendo GameCube", family: "NINTENDO", sort: 440, qids: ["Q182172"], aliases: ["nintendo gamecube", "gamecube", "gc"] },
  { key: "wii", name: "Wii", family: "NINTENDO", sort: 450, qids: ["Q8079", "Q2014637"], aliases: ["wii", "nintendo wii", "wiiware"] },
  { key: "wii_u", name: "Wii U", family: "NINTENDO", sort: 460, qids: ["Q56942"], aliases: ["wii u", "nintendo wii u"] },
  { key: "switch", name: "Nintendo Switch", family: "NINTENDO", sort: 470, qids: ["Q19610114", "Q123392577"], aliases: ["nintendo switch"] },
  { key: "switch2", name: "Nintendo Switch 2", family: "NINTENDO", sort: 480, qids: ["Q122761124"], aliases: ["nintendo switch 2"] },
  { key: "game_boy", name: "Game Boy", family: "NINTENDO", sort: 510, qids: ["Q186437"], aliases: ["game boy", "gameboy", "gb"] },
  { key: "game_boy_color", name: "Game Boy Color", family: "NINTENDO", sort: 520, qids: ["Q203992"], aliases: ["game boy color", "gameboy color", "gbc"] },
  { key: "game_boy_advance", name: "Game Boy Advance", family: "NINTENDO", sort: 530, qids: ["Q188642"], aliases: ["game boy advance", "gameboy advance", "gba"] },
  { key: "game_and_watch", name: "Game & Watch", family: "NINTENDO", sort: 505, qids: ["Q215034"], aliases: ["game & watch", "game and watch", "game & watch series"] },
  { key: "virtual_boy", name: "Virtual Boy", family: "NINTENDO", sort: 540, qids: ["Q164651"], aliases: ["virtual boy"] },
  { key: "nintendo_ds", name: "Nintendo DS", family: "NINTENDO", sort: 550, qids: ["Q170323", "Q844552"], aliases: ["nintendo ds", "nds", "ds", "nintendo ds lite", "ds lite"] },
  { key: "nintendo_dsi", name: "Nintendo DSi", family: "NINTENDO", sort: 560, qids: ["Q637178", "Q1898891"], aliases: ["nintendo dsi", "dsi", "dsiware"] },
  { key: "nintendo_3ds", name: "Nintendo 3DS", family: "NINTENDO", sort: 570, qids: ["Q203597", "Q17679679"], aliases: ["nintendo 3ds", "3ds", "new nintendo 3ds"] },

  // ---- Sega ----------------------------------------------------------------------------------------------------------------------------------------------
  { key: "sg_1000", name: "Sega SG-1000", family: "SEGA", sort: 610, qids: ["Q1136956"], aliases: ["sg-1000", "sega sg-1000"] },
  { key: "master_system", name: "Sega Master System", family: "SEGA", sort: 620, qids: ["Q209868"], aliases: ["sega master system", "master system"] },
  { key: "genesis", name: "Sega Genesis / Mega Drive", family: "SEGA", sort: 630, qids: ["Q10676"], aliases: ["sega genesis", "genesis", "mega drive", "sega mega drive"] },
  { key: "sega_cd", name: "Sega CD / Mega-CD", family: "SEGA", sort: 640, qids: ["Q1047516"], aliases: ["sega cd", "mega cd", "mega-cd", "sega mega-cd"] },
  { key: "sega_32x", name: "Sega 32X", family: "SEGA", sort: 650, qids: ["Q1063978"], aliases: ["sega 32x", "32x"] },
  { key: "saturn", name: "Sega Saturn", family: "SEGA", sort: 660, qids: ["Q200912"], aliases: ["sega saturn", "saturn"] },
  { key: "dreamcast", name: "Sega Dreamcast", family: "SEGA", sort: 670, qids: ["Q184198"], aliases: ["dreamcast", "sega dreamcast"] },
  { key: "game_gear", name: "Sega Game Gear", family: "SEGA", sort: 680, qids: ["Q751719"], aliases: ["game gear", "sega game gear"] },

  // ---- Atari / NEC / SNK -----------------------------------------------------------------------------------------------------------------------------
  { key: "atari_2600", name: "Atari 2600", family: "ATARI", sort: 710, qids: ["Q206261", "Q41168744"], aliases: ["atari 2600", "atari vcs"] },
  { key: "atari_5200", name: "Atari 5200", family: "ATARI", sort: 720, qids: ["Q743222"], aliases: ["atari 5200"] },
  { key: "atari_7800", name: "Atari 7800", family: "ATARI", sort: 730, qids: ["Q753600"], aliases: ["atari 7800"] },
  { key: "atari_lynx", name: "Atari Lynx", family: "ATARI", sort: 740, qids: ["Q753657"], aliases: ["atari lynx", "lynx"] },
  { key: "atari_jaguar", name: "Atari Jaguar", family: "ATARI", sort: 750, qids: ["Q650601"], aliases: ["atari jaguar", "jaguar"] },
  { key: "turbografx_16", name: "TurboGrafx-16 / PC Engine", family: "NEC", sort: 810, qids: ["Q1057377", "Q202375"], aliases: ["turbografx-16", "turbografx 16", "pc engine", "pc engine supergrafx", "supergrafx"] },
  { key: "neo_geo", name: "Neo Geo", family: "SNK", sort: 910, qids: ["Q1054350", "Q3338058", "Q64428080"], aliases: ["neo geo", "neo geo aes", "neo geo mvs", "neogeo"] },
  { key: "neo_geo_cd", name: "Neo Geo CD", family: "SNK", sort: 920, qids: ["Q2703883"], aliases: ["neo geo cd"] },
  { key: "neo_geo_pocket_color", name: "Neo Geo Pocket Color", family: "SNK", sort: 930, qids: ["Q1977455"], aliases: ["neo geo pocket color"] },

  // ---- mobile ----------------------------------------------------------------------------------------------------------------------------------------------
  { key: "ios", name: "iOS", family: "MOBILE", sort: 1010, qids: ["Q48493", "Q64350339", "Q14094"], aliases: ["ios", "iphone os", "ipados", "ipod touch"] },
  { key: "android", name: "Android", family: "MOBILE", sort: 1020, qids: ["Q94"], aliases: ["android"] },
  { key: "windows_phone", name: "Windows Phone", family: "MOBILE", sort: 1030, qids: ["Q4885200", "Q34825", "Q15282750"], aliases: ["windows phone", "windows phone 7", "windows phone 8"] },
  { key: "windows_mobile", name: "Windows Mobile", family: "MOBILE", sort: 1035, qids: ["Q21207", "Q29758"], aliases: ["windows mobile", "pocket pc"] },
  { key: "blackberry", name: "BlackBerry", family: "MOBILE", sort: 1040, qids: ["Q879989", "Q880016", "Q171819"], aliases: ["blackberry", "blackberry os", "blackberry 10"] },
  { key: "symbian", name: "Symbian", family: "MOBILE", sort: 1050, qids: ["Q483318"], aliases: ["symbian"] },
  { key: "java_me", name: "Java ME (feature phones)", family: "MOBILE", sort: 1060, qids: ["Q193828"], aliases: ["java platform, micro edition", "java me", "j2me"] },
  { key: "n_gage", name: "Nokia N-Gage", family: "MOBILE", sort: 1070, qids: ["Q336434", "Q2447314"], aliases: ["n-gage", "nokia n-gage"] },

  // ---- other ----------------------------------------------------------------------------------------------------------------------------------------------
  { key: "arcade", name: "Arcade", family: "OTHER", sort: 1110, qids: ["Q192851", "Q15613992", "Q186637", "Q113726751", "Q1067380", "Q1034233"], aliases: ["arcade video game", "arcade", "arcade game"] },
  { key: "web_browser", name: "Web browser", family: "OTHER", sort: 1120, qids: ["Q6368", "Q848991"], aliases: ["web browser", "browser game"] },
  { key: "colecovision", name: "ColecoVision", family: "OTHER", sort: 1130, qids: ["Q1046862"], aliases: ["colecovision"] },
  { key: "intellivision", name: "Intellivision", family: "OTHER", sort: 1140, qids: ["Q1061441"], aliases: ["intellivision"] },
  { key: "three_do", name: "3DO", family: "OTHER", sort: 1150, qids: ["Q229429"], aliases: ["3do", "3do interactive multiplayer"] },
  { key: "philips_cd_i", name: "Philips CD-i", family: "OTHER", sort: 1160, qids: ["Q1023103"], aliases: ["philips cd-i", "cd-i"] },
  { key: "ouya", name: "Ouya", family: "OTHER", sort: 1170, qids: ["Q1391641"], aliases: ["ouya"] },
  { key: "amiga_cd32", name: "Amiga CD32", family: "OTHER", sort: 1180, qids: ["Q695161"], aliases: ["amiga cd32", "cd32"] },
  { key: "amiga_cdtv", name: "Commodore CDTV", family: "OTHER", sort: 1181, qids: ["Q955368"], aliases: ["commodore cdtv", "cdtv"] },
  { key: "apple_tv", name: "Apple TV (tvOS)", family: "OTHER", sort: 1182, qids: ["Q20965967", "Q270285"], aliases: ["tvos", "apple tv"] },
  { key: "wonderswan", name: "WonderSwan", family: "OTHER", sort: 1183, qids: ["Q1065792"], aliases: ["wonderswan"] },
  { key: "wonderswan_color", name: "WonderSwan Color", family: "OTHER", sort: 1184, qids: ["Q1048035"], aliases: ["wonderswan color"] },
  { key: "zeebo", name: "Zeebo", family: "OTHER", sort: 1185, qids: ["Q184372"], aliases: ["zeebo"] },
  { key: "odyssey_2", name: "Magnavox Odyssey 2", family: "OTHER", sort: 1186, qids: ["Q576932"], aliases: ["magnavox odyssey 2", "odyssey 2", "odyssey²"] },
  { key: "vectrex", name: "Vectrex", family: "OTHER", sort: 1187, qids: ["Q767631"], aliases: ["vectrex"] },
]);

// Wikidata platform item -> key (derived, so the two can never disagree)
export const PLATFORM_QIDS = Object.freeze(Object.fromEntries(PLATFORMS.flatMap(platform => platform.qids.map(qid => [qid, platform.key]))));

const fold = label => String(label ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const LABELS = new Map(PLATFORMS.flatMap(platform => [platform.name, ...platform.aliases].map(label => [fold(label), platform.key])));

// Resolves a platform NAME (a label, an alias, a regional name) to its normalized key, or null. Used by the platform audit to spot a duplicate Wikidata item for a
// system that is already mapped.
export const platformKeyForLabel = label => LABELS.get(fold(label)) ?? null;
