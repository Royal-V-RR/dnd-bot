'use strict';

// ═══════════════════════════════════════════════════════════════
//  ⚔️  D&D 5e Discord Bot  —  index.cjs
//  Repo   : Royal-V-RR/dnd-bot
//  Engine : Discord.js v14  |  Node 20  |  CommonJS
// ═══════════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  InteractionType, ComponentType,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ───────────────────────────────────────────────────────────────
//  ENV
// ───────────────────────────────────────────────────────────────
const TOKEN       = process.env.DISCORD_TOKEN;
const CLIENT_ID   = process.env.CLIENT_ID || '1500567588214673498';
const CAMPAIGN_DIR = process.env.CAMPAIGN_DIR || 'campaigns';

// ───────────────────────────────────────────────────────────────
//  THEME  (all embeds use these)
// ───────────────────────────────────────────────────────────────
const CLR = {
  main:    0x2C2F33,   // dark slate
  gold:    0xF0A500,   // header gold
  red:     0xC0392B,   // danger / damage
  green:   0x27AE60,   // heal / success
  purple:  0x6C3483,   // magic / spells
  blue:    0x2471A3,   // info / rolls
  orange:  0xCA6F1E,   // cursed
  yellow:  0xF4D03F,   // blessed / crit
  grey:    0x636E72,   // neutral / DM
};

const EMOJI = {
  sword:    '⚔️',  shield:   '🛡️',  heart:    '❤️',
  skull:    '💀',  star:     '⭐',  magic:    '✨',
  scroll:   '📜',  book:     '📖',  map:      '🗺️',
  gold:     '💰',  bag:      '🎒',  dice:     '🎲',
  blessed:  '🌟',  cursed:   '💀',  d20:      '🎯',
  up:       '⬆️',  down:     '⬇️',  moon:     '🌙',
  sun:      '☀️',  warn:     '⚠️',  check:    '✅',
  cross:    '❌',  lock:     '🔒',  calendar: '📅',
  crown:    '👑',  flame:    '🔥',  drop:     '💧',
  party:    '🎉',  eye:      '👁️',  note:     '📝',
  sparkle:  '💫',  blood:    '🩸',  sleep:    '😴',
};

// ───────────────────────────────────────────────────────────────
//  FILE / GIT HELPERS
// ───────────────────────────────────────────────────────────────
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeName(s) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

function campaignPath(guildId, name) {
  return path.join(CAMPAIGN_DIR, guildId, `${safeName(name)}.json`);
}

function loadCampaign(guildId, name) {
  const p = campaignPath(guildId, name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function saveCampaign(guildId, name, data) {
  const dir = path.join(CAMPAIGN_DIR, guildId);
  ensureDir(dir);
  fs.writeFileSync(campaignPath(guildId, name), JSON.stringify(data, null, 2));
  gitCommit(`chore: save campaign "${name}" [${guildId}]`);
}

function listCampaigns(guildId) {
  const dir = path.join(CAMPAIGN_DIR, guildId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

function gitCommit(msg) {
  try {
    execSync('git add campaigns/');
    execSync(`git diff --staged --quiet || git commit -m "${msg}"`);
    execSync('git push');
  } catch (e) {
    console.warn('[git]', e.message?.split('\n')[0]);
  }
}

// ───────────────────────────────────────────────────────────────
//  ACTIVE CAMPAIGN CACHE
// ───────────────────────────────────────────────────────────────
const activeMap = {}; // guildId -> campaignName
const getActive = gid => activeMap[gid] || null;
const setActive = (gid, n) => { activeMap[gid] = n; };

// ───────────────────────────────────────────────────────────────
//  ROLE CHECKS
// ───────────────────────────────────────────────────────────────
const DM_NAMES   = ['dm','dungeon master','game master','gm'];
const PLYR_NAMES = ['player'];

function isDM(member) {
  return member.roles.cache.some(r => DM_NAMES.includes(r.name.toLowerCase()));
}
function isPlayer(member) {
  return isDM(member) || member.roles.cache.some(r => PLYR_NAMES.includes(r.name.toLowerCase()));
}

// ───────────────────────────────────────────────────────────────
//  5E CONSTANTS
// ───────────────────────────────────────────────────────────────
const ABILITIES = ['strength','dexterity','constitution','intelligence','wisdom','charisma'];
const ABBR = { strength:'STR', dexterity:'DEX', constitution:'CON', intelligence:'INT', wisdom:'WIS', charisma:'CHA' };

const SKILLS = {
  acrobatics:'dexterity','animal handling':'wisdom',arcana:'intelligence',
  athletics:'strength',deception:'charisma',history:'intelligence',
  insight:'wisdom',intimidation:'charisma',investigation:'intelligence',
  medicine:'wisdom',nature:'intelligence',perception:'wisdom',
  performance:'charisma',persuasion:'charisma',religion:'intelligence',
  'sleight of hand':'dexterity',stealth:'dexterity',survival:'wisdom',
};

const CLASSES = ['Artificer','Barbarian','Bard','Cleric','Druid','Fighter',
  'Monk','Paladin','Ranger','Rogue','Sorcerer','Warlock','Wizard'];

const RACES = ['Dragonborn','Dwarf','Elf','Gnome','Half-Elf','Half-Orc',
  'Halfling','Human','Tiefling','Aasimar','Genasi','Goliath','Tabaxi',
  'Tortle','Kenku','Lizardfolk','Yuan-ti Pureblood'];

const ALIGNMENTS = [
  'Lawful Good','Neutral Good','Chaotic Good',
  'Lawful Neutral','True Neutral','Chaotic Neutral',
  'Lawful Evil','Neutral Evil','Chaotic Evil',
];

const CONDITIONS_LIST = [
  'Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled',
  'Incapacitated','Invisible','Paralyzed','Petrified','Poisoned',
  'Prone','Restrained','Stunned','Unconscious',
];

const PROF_BONUS  = [0,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6];
const XP_TABLE    = [0,300,900,2700,6500,14000,23000,34000,48000,64000,
  85000,100000,120000,140000,165000,195000,225000,265000,305000,355000];
const HD_BY_CLASS = {
  Barbarian:12,Fighter:10,Paladin:10,Ranger:10,Artificer:8,Bard:8,
  Cleric:8,Druid:8,Monk:8,Rogue:8,Warlock:8,Sorcerer:6,Wizard:6,
};
const FULL_SLOTS = {
  1:[2],2:[3],3:[4,2],4:[4,3],5:[4,3,2],6:[4,3,3],7:[4,3,3,1],
  8:[4,3,3,2],9:[4,3,3,3,1],10:[4,3,3,3,2],11:[4,3,3,3,2,1],
  12:[4,3,3,3,2,1],13:[4,3,3,3,2,1,1],14:[4,3,3,3,2,1,1],
  15:[4,3,3,3,2,1,1,1],16:[4,3,3,3,2,1,1,1],17:[4,3,3,3,2,1,1,1,1],
  18:[4,3,3,3,3,1,1,1,1],19:[4,3,3,3,3,2,1,1,1],20:[4,3,3,3,3,2,2,1,1],
};
const ENC_XP = {
  1:[25,50,75,100],2:[50,100,150,200],3:[75,150,225,400],4:[125,250,375,500],
  5:[250,500,750,1100],6:[300,600,900,1400],7:[350,750,1100,1700],
  8:[450,900,1400,2100],9:[550,1100,1600,2400],10:[600,1200,1900,2800],
  11:[800,1600,2400,3600],12:[1000,2000,3000,4500],13:[1100,2200,3400,5100],
  14:[1250,2500,3800,5700],15:[1400,2800,4300,6400],16:[1600,3200,4800,7200],
  17:[2000,3900,5900,8800],18:[2100,4200,6300,9500],19:[2400,4900,7300,10900],
  20:[2800,5700,8500,12700],
};

const CONDITION_DESC = {
  Blinded:       '• Auto-fails sight checks\n• Attackers have **advantage**, creature attacks at **disadvantage**',
  Charmed:       "• Can't attack the charmer\n• Charmer has **advantage** on social checks vs creature",
  Deafened:      '• Auto-fails hearing checks',
  Exhaustion:    '**1** Disadv on checks · **2** Speed halved · **3** Disadv attacks/saves · **4** HP max halved · **5** Speed 0 · **6** Death',
  Frightened:    '• Disadv on checks/attacks while source is visible\n• Cannot move **toward** source',
  Grappled:      '• Speed becomes **0**\n• Ends if grappler is incapacitated',
  Incapacitated: '• Cannot take **actions** or **reactions**',
  Invisible:     '• Impossible to see without special sense\n• Attacks **against** have disadv · own attacks have **advantage**',
  Paralyzed:     '• Incapacitated, cannot move or speak\n• Auto-fails STR/DEX saves\n• Attacks have adv · hits within 5ft are **critical**',
  Petrified:     '• Transformed to stone · incapacitated · unaware\n• Auto-fails STR/DEX saves\n• Resistance to all damage · immune poison/disease',
  Poisoned:      '• **Disadvantage** on attack rolls and ability checks',
  Prone:         '• Only movement: crawling (costs double)\n• **Disadv** on attacks\n• Melee attacks have **adv** · ranged have **disadv**',
  Restrained:    '• Speed **0** · disadv on attacks · adv attacks vs it\n• **Disadv** on DEX saves',
  Stunned:       '• Incapacitated, can't move, can barely speak\n• Auto-fails STR/DEX saves · attackers have **adv**',
  Unconscious:   '• Incapacitated, prone, unaware\n• Auto-fails STR/DEX saves\n• Hits within 5ft are **critical**',
};

const ACTION_DESC = {
  Attack:             'Make one melee or ranged attack. Extra Attack feature allows additional attacks.',
  Dash:               'Gain extra movement equal to your speed for the turn.',
  Disengage:          "Your movement doesn't provoke opportunity attacks for the rest of the turn.",
  Dodge:              'Until next turn: attacks against you have **disadvantage** (if you can see attacker), DEX saves have **advantage**.',
  Help:               "Grant an ally **advantage** on next ability check or attack, OR distract a foe within 5ft for an ally's attack.",
  Hide:               'Make a **DEX (Stealth)** check. On success, you become hidden.',
  Ready:              'Declare a trigger and an action/movement. Use your reaction when trigger occurs.',
  Search:             'Make a **Perception** or **Investigation** check to find something.',
  'Use Object':       'Interact with an object that requires a full action.',
  Grapple:            '**Athletics** vs target **Athletics/Acrobatics**. Success → target is grappled.',
  Shove:              '**Athletics** vs target **Athletics/Acrobatics**. Push 5ft away or knock **prone**.',
  'Opportunity Attack':'When a hostile creature leaves your reach, use your **reaction** for one melee attack.',
  'Two-Weapon Fighting':'When attacking with a light weapon, use a **bonus action** to attack with the other light weapon (no ability modifier to damage).',
  Grapple_Break:      'Use your action to attempt an **Athletics or Acrobatics** check vs grappler\'s **Athletics** (DC = result).',
};

// ───────────────────────────────────────────────────────────────
//  DICE ENGINE
// ───────────────────────────────────────────────────────────────
const d = sides => Math.floor(Math.random() * sides) + 1;

function rollPool(count, sides, mode = 'normal') {
  const rolls = Array.from({ length: count }, () => d(sides));
  let kept = [...rolls], note = '';
  if (mode === 'blessed') {
    const extra = d(sides);
    const all   = [...rolls, extra].sort((a,b) => b - a);
    kept = all.slice(0, count);
    note = `${EMOJI.blessed} Blessed — extra: **${extra}**, kept highest`;
  } else if (mode === 'cursed') {
    const extra = d(sides);
    const all   = [...rolls, extra].sort((a,b) => a - b);
    kept = all.slice(0, count);
    note = `${EMOJI.cursed} Cursed — extra: **${extra}**, kept lowest`;
  }
  return { rolls, kept, total: kept.reduce((a,b)=>a+b,0), note };
}

function parseExpr(raw) {
  const m = raw.toLowerCase().trim()
    .match(/^(\d*)d(\d+)(?:k([hl])(\d+))?([+-]\d+)?$/);
  if (!m) return null;
  return {
    count: parseInt(m[1]||'1'), sides: parseInt(m[2]),
    keepDir: m[3]||null, keepN: m[4]?parseInt(m[4]):null,
    mod: m[5]?parseInt(m[5]):0,
  };
}

function executeRoll(expr, mode = 'normal') {
  const p = parseExpr(expr);
  if (!p || p.sides < 2 || p.count < 1 || p.count > 200) return null;
  const { count, sides, keepDir, keepN, mod } = p;
  const { rolls, kept, total, note } = rollPool(count, sides, mode);

  let final = kept, keepNote = '';
  if (keepDir && keepN) {
    const sorted = [...kept].sort((a,b) => keepDir==='h' ? b-a : a-b);
    final    = sorted.slice(0, keepN);
    keepNote = `Keep ${keepDir==='h'?'highest':'lowest'} ${keepN}`;
  }
  const sum = final.reduce((a,b)=>a+b,0) + mod;
  return { rolls, kept, final, sum, mod, sides, count, note, keepNote, nat: final[0] };
}

// ───────────────────────────────────────────────────────────────
//  CHARACTER HELPERS
// ───────────────────────────────────────────────────────────────
const abilMod  = s => Math.floor((s - 10) / 2);
const modStr   = n => n >= 0 ? `+${n}` : `${n}`;
const pb       = lvl => PROF_BONUS[Math.min(lvl, 20)] || 2;

function skillBonus(char, skill) {
  const ab   = SKILLS[skill.toLowerCase()];
  if (!ab) return 0;
  const base = abilMod(char.abilities[ab] || 10);
  const prof = char.proficiencies?.skills?.includes(skill.toLowerCase()) ? pb(char.level||1) : 0;
  const exp  = char.expertises?.includes(skill.toLowerCase()) ? pb(char.level||1) : 0;
  return base + prof + exp;
}

function saveBonus(char, ab) {
  const base = abilMod(char.abilities[ab.toLowerCase()] || 10);
  const prof = char.proficiencies?.saves?.includes(ab.toLowerCase()) ? pb(char.level||1) : 0;
  return base + prof;
}

function passivePerception(char) {
  return 10 + skillBonus(char, 'perception');
}

function newCharacter(userId, name, race, cls, level = 1) {
  const hd = HD_BY_CLASS[cls] || 8;
  const conMod = 0;
  return {
    userId, name, race, class: cls, subclass: '',
    level, xp: 0, background: '', alignment: '',
    abilities: { strength:10, dexterity:10, constitution:10, intelligence:10, wisdom:10, charisma:10 },
    hp:        { max: hd + conMod, current: hd + conMod, temp: 0 },
    hitDice:   { total: level, used: 0, type: hd },
    ac: 10, speed: 30, initiative: 0,
    inspiration: false,
    proficiencies: { skills:[], saves:[], armor:[], weapons:[], tools:[], languages:['Common'] },
    expertises: [],
    attacks: [],
    spells: { slots:{}, known:[], concentration: null },
    inventory: [],
    currency: { cp:0, sp:0, ep:0, gp:0, pp:0 },
    features: [],
    traits: { personality:'', ideals:'', bonds:'', flaws:'' },
    notes: '',
    conditions: [],
    deathSaves: { successes:0, failures:0 },
  };
}

// ───────────────────────────────────────────────────────────────
//  UI PRIMITIVES
// ───────────────────────────────────────────────────────────────
function hpBar(cur, max, len = 12) {
  const ratio   = Math.max(0, Math.min(1, cur / max));
  const filled  = Math.round(ratio * len);
  const color   = ratio > 0.6 ? '🟩' : ratio > 0.3 ? '🟨' : '🟥';
  return color.repeat(filled) + '⬛'.repeat(len - filled);
}

function xpBar(xp, level, len = 10) {
  const cur  = XP_TABLE[Math.min(level-1, 19)] || 0;
  const next = XP_TABLE[Math.min(level, 19)]   || XP_TABLE[19];
  const pct  = Math.min(1, (xp - cur) / (next - cur));
  const fill = Math.round(pct * len);
  return '█'.repeat(fill) + '░'.repeat(len - fill) + ` ${Math.round(pct*100)}%`;
}

function conditionBadges(conds) {
  if (!conds?.length) return '*None*';
  return conds.map(c => `\`${c}\``).join(' ');
}

function coinStr(cur) {
  const { pp=0, gp=0, ep=0, sp=0, cp=0 } = cur || {};
  return [pp&&`${pp}pp`, gp&&`${gp}gp`, ep&&`${ep}ep`, sp&&`${sp}sp`, cp&&`${cp}cp`]
    .filter(Boolean).join(' · ') || '*empty*';
}

function initiativeList(data) {
  if (!data.initiative?.length) return '*No combatants.*';
  const turn = data.initiativeTurn ?? 0;
  return data.initiative.map((e, i) => {
    const arrow = i === turn ? '**▶**' : '　';
    const hp    = e.hp ? ` — HP ${e.hp}` : '';
    return `${arrow} \`${String(e.value).padStart(2)}\` ${e.name}${hp}`;
  }).join('\n');
}

// ───────────────────────────────────────────────────────────────
//  EMBED BUILDERS
// ───────────────────────────────────────────────────────────────
function errorEmbed(msg) {
  return new EmbedBuilder().setColor(CLR.red)
    .setDescription(`${EMOJI.cross} ${msg}`);
}

function successEmbed(msg) {
  return new EmbedBuilder().setColor(CLR.green)
    .setDescription(`${EMOJI.check} ${msg}`);
}

function charSheetEmbed(char, title = null) {
  const mods = {};
  for (const a of ABILITIES) mods[a] = abilMod(char.abilities[a] || 10);
  const prof = pb(char.level || 1);

  // ── ability block ──
  const abilBlock = ABILITIES.map(a =>
    `\`${ABBR[a]}\` **${String(char.abilities[a]).padStart(2)}** ${modStr(mods[a])}`
  ).join('  ');

  // ── saves ──
  const saveBlock = ABILITIES.map(a => {
    const b   = saveBonus(char, a);
    const pro = char.proficiencies?.saves?.includes(a) ? '●' : '○';
    return `${pro} ${ABBR[a]} **${modStr(b)}**`;
  }).join('  ');

  // ── skills split into 2 cols ──
  const allSkills = Object.keys(SKILLS).map(s => {
    const b   = skillBonus(char, s);
    const pro = char.proficiencies?.skills?.includes(s);
    const exp = char.expertises?.includes(s);
    const dot = exp ? '◆' : pro ? '●' : '○';
    const label = s.split(' ').map(w => w[0].toUpperCase()+w.slice(1)).join(' ');
    return `${dot} ${label} **${modStr(b)}**`;
  });
  const half    = Math.ceil(allSkills.length / 2);
  const skillL  = allSkills.slice(0, half).join('\n');
  const skillR  = allSkills.slice(half).join('\n');

  // ── HP bar ──
  const { current: hpC, max: hpM, temp: hpT } = char.hp;
  const bar    = hpBar(hpC, hpM);
  const hpLine = `${hpC}/${hpM}${hpT ? ` *(+${hpT} tmp)*` : ''}`;
  const status = hpC === 0 ? `${EMOJI.skull} **DOWNED**` : hpC <= Math.floor(hpM * 0.25) ? `${EMOJI.warn} Bloodied` : `${EMOJI.heart} Healthy`;

  // ── currency ──
  const purse = coinStr(char.currency);

  // ── spell slots ──
  const slotLines = Object.entries(char.spells?.slots || {})
    .filter(([,v]) => v.total > 0)
    .map(([lvl,v]) => {
      const rem  = v.total - v.used;
      const dots = '◉'.repeat(rem) + '◎'.repeat(v.used);
      return `L${lvl}: ${dots}`;
    }).join('  ');

  const embed = new EmbedBuilder()
    .setColor(CLR.gold)
    .setTitle(`${EMOJI.scroll}  ${title || char.name}`)
    .setDescription(
      `*${char.race}  ·  ${char.class}${char.subclass ? ` (${char.subclass})` : ''}  ·  Level **${char.level}***` +
      `${char.background ? `\n${EMOJI.book} ${char.background}` : ''}` +
      `${char.alignment  ? `  ·  ${char.alignment}` : ''}`
    )
    .addFields(
      { name: `${EMOJI.sword} Ability Scores`, value: abilBlock, inline: false },
      { name: `${EMOJI.heart} HP  ${bar}`, value: `${hpLine}  ·  ${status}`, inline: false },
      { name: `${EMOJI.shield} AC`, value: `**${char.ac}**`, inline: true },
      { name: '💨 Speed',           value: `**${char.speed}** ft`, inline: true },
      { name: '🎯 Initiative',      value: `**${modStr(mods.dexterity + (char.initiative||0))}**`, inline: true },
      { name: '✨ Prof Bonus',      value: `**${modStr(prof)}**`, inline: true },
      { name: '💡 Inspiration',     value: char.inspiration ? '**Yes** ✨' : 'No', inline: true },
      { name: '👁️ Passive Perc.',  value: `**${passivePerception(char)}**`, inline: true },
      { name: '🎯 Saving Throws',   value: saveBlock, inline: false },
      { name: `${EMOJI.book} Skills`, value: skillL, inline: true },
      { name: '\u200b',              value: skillR,   inline: true },
    );

  if (char.conditions?.length)
    embed.addFields({ name: `${EMOJI.warn} Conditions`, value: conditionBadges(char.conditions), inline: false });

  if (char.attacks?.length)
    embed.addFields({ name: `${EMOJI.sword} Attacks`, value:
      char.attacks.map(a => `**${a.name}** — ${a.toHit} to hit · ${a.damage}${a.type ? ` *${a.type}*` : ''}`).join('\n'),
      inline: false });

  if (slotLines)
    embed.addFields({ name: `${EMOJI.magic} Spell Slots`, value: slotLines, inline: false });

  if (char.spells?.concentration)
    embed.addFields({ name: '🌀 Concentration', value: `*${char.spells.concentration}*`, inline: true });

  if (char.inventory?.length)
    embed.addFields({ name: `${EMOJI.bag} Inventory`, value:
      char.inventory.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}${i.notes ? ` *(${i.notes})*` : ''}`).join(', '),
      inline: false });

  embed.addFields({ name: `${EMOJI.gold} Purse`, value: purse, inline: false });

  const { personality, ideals, bonds, flaws } = char.traits || {};
  const traitParts = [
    personality && `**Personality:** ${personality}`,
    ideals      && `**Ideals:** ${ideals}`,
    bonds       && `**Bonds:** ${bonds}`,
    flaws       && `**Flaws:** ${flaws}`,
  ].filter(Boolean);
  if (traitParts.length)
    embed.addFields({ name: `${EMOJI.note} Traits`, value: traitParts.join('\n'), inline: false });

  if (char.features?.length)
    embed.addFields({ name: '⚙️ Features', value:
      char.features.slice(0,10).map(f => `**${f.name}**${f.desc ? `: ${f.desc}` : ''}`).join('\n'),
      inline: false });

  if (char.notes)
    embed.addFields({ name: `${EMOJI.note} Notes`, value: char.notes.slice(0,1000), inline: false });

  const xpCur  = XP_TABLE[Math.min(char.level-1, 19)] || 0;
  const xpNext = XP_TABLE[Math.min(char.level, 19)]   || XP_TABLE[19];
  embed.addFields({ name: '📊 XP', value: `${(char.xp||0).toLocaleString()} / ${xpNext.toLocaleString()}\n${xpBar(char.xp||0, char.level)}`, inline: false });

  embed.setFooter({ text: `Hit Dice: ${char.hitDice.total - char.hitDice.used}/${char.hitDice.total} d${char.hitDice.type} remaining  ·  ○ = none  ● = prof  ◆ = expertise` });
  return embed;
}

function rollEmbed(label, expr, result, mode) {
  const isBlessed = mode === 'blessed';
  const isCursed  = mode === 'cursed';
  const modeTag   = isBlessed ? `${EMOJI.blessed} Blessed` : isCursed ? `${EMOJI.cursed} Cursed` : `${EMOJI.dice} Normal`;
  const color     = isBlessed ? CLR.yellow : isCursed ? CLR.orange : CLR.blue;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${modeTag}  ·  ${label}`)
    .addFields(
      { name: 'Expression', value: `\`${expr}\``, inline: true },
      { name: 'Dice',       value: `\`[${result.final.join(', ')}]\``, inline: true },
      { name: 'Total',      value: `# ${result.sum}${result.mod ? `  *(${modStr(result.mod)})*` : ''}`, inline: true },
    );

  const foot = [result.note, result.keepNote].filter(Boolean).join('  ·  ');
  if (foot) embed.setFooter({ text: foot });
  return embed;
}

function attackEmbed(weaponName, atkResult, damResult, mode, damType) {
  const nat    = atkResult.final[0];
  const isCrit = nat === 20;
  const isFumb = nat === 1;
  const color  = isCrit ? CLR.yellow : isFumb ? CLR.red : CLR.blue;

  let totalDam = damResult?.sum || 0;
  let critBonus = 0;
  if (isCrit && damResult) {
    const bonus = damResult.final.map(() => d(damResult.sides || 6));
    critBonus   = bonus.reduce((a,b)=>a+b,0);
    totalDam   += critBonus;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${EMOJI.sword}  ${weaponName}`)
    .addFields(
      { name: 'Attack Roll', value: `\`d20 → ${nat}\`\n**${atkResult.sum}** to hit`, inline: true },
      { name: `Damage${damType ? ` *(${damType})*` : ''}`,
        value: damResult
          ? `\`[${damResult.final.join(', ')}]\`\n**${totalDam}**${critBonus ? ` *(+${critBonus} crit)*` : ''}`
          : '*—*',
        inline: true },
    );

  if (isCrit) embed.addFields({ name: `${EMOJI.star} Critical Hit!`, value: 'Double damage dice rolled.', inline: false });
  if (isFumb) embed.addFields({ name: '💥 Critical Fumble!', value: 'A spectacular failure.', inline: false });
  if (atkResult.note) embed.setFooter({ text: atkResult.note });
  return embed;
}

function partyEmbed(campName, chars) {
  const embed = new EmbedBuilder()
    .setColor(CLR.gold)
    .setTitle(`${EMOJI.map}  Party Overview  ·  ${campName}`)
    .setDescription(`**${chars.length}** adventurer${chars.length !== 1 ? 's' : ''}`);

  for (const c of chars) {
    const bar  = hpBar(c.hp.current, c.hp.max, 8);
    const cond = c.conditions?.length ? `  ${EMOJI.warn} ${c.conditions.join(', ')}` : '';
    const conc = c.spells?.concentration ? `  🌀 *${c.spells.concentration}*` : '';
    const insp = c.inspiration ? `  ${EMOJI.magic}` : '';
    embed.addFields({
      name: `${c.name}  ·  ${c.race} ${c.class} ${c.level}`,
      value: `${bar}  **${c.hp.current}/${c.hp.max}** HP${c.hp.temp ? ` *(+${c.hp.temp})*` : ''}` +
             `  ·  AC **${c.ac}**${cond}${conc}${insp}`,
      inline: false,
    });
  }
  return embed;
}

function initiativeEmbed(campName, data) {
  return new EmbedBuilder()
    .setColor(CLR.red)
    .setTitle(`${EMOJI.sword}  Combat  ·  ${campName}`)
    .setDescription(initiativeList(data))
    .setFooter({ text: `Round ${data.round || 1}` });
}

// ───────────────────────────────────────────────────────────────
//  BUTTON ROWS
// ───────────────────────────────────────────────────────────────
function hpButtons(charUserId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hp_heal_${charUserId}`).setLabel('+HP').setEmoji('❤️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hp_dmg_${charUserId}`).setLabel('-HP').setEmoji('🩸').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`hp_temp_${charUserId}`).setLabel('Temp HP').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rest_short_${charUserId}`).setLabel('Short Rest').setEmoji('☀️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rest_long_${charUserId}`).setLabel('Long Rest').setEmoji('🌙').setStyle(ButtonStyle.Primary),
  );
}

function rollModeButtons(base) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${base}_normal`).setLabel('Normal').setEmoji('🎲').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${base}_blessed`).setLabel('Blessed').setEmoji('🌟').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${base}_cursed`).setLabel('Cursed').setEmoji('💀').setStyle(ButtonStyle.Danger),
  );
}

function deathSaveButtons(charUserId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ds_normal_${charUserId}`).setLabel('Roll Normal').setEmoji('🎲').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ds_blessed_${charUserId}`).setLabel('Blessed').setEmoji('🌟').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ds_cursed_${charUserId}`).setLabel('Cursed').setEmoji('💀').setStyle(ButtonStyle.Danger),
  );
}

function initiativeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('init_next').setLabel('Next Turn').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('init_show').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('init_clear').setLabel('End Combat').setEmoji('🛑').setStyle(ButtonStyle.Danger),
  );
}

// ───────────────────────────────────────────────────────────────
//  MODAL HELPERS
// ───────────────────────────────────────────────────────────────
function textInput(id, label, placeholder, style = TextInputStyle.Short, required = true, value = '') {
  return new TextInputBuilder()
    .setCustomId(id).setLabel(label).setPlaceholder(placeholder)
    .setStyle(style).setRequired(required)
    .setValue(value);
}

// ───────────────────────────────────────────────────────────────
//  CAMPAIGN / CHARACTER RESOLUTION
// ───────────────────────────────────────────────────────────────
function getActiveCamp(interaction) {
  const name = getActive(interaction.guildId);
  if (!name) return null;
  const data = loadCampaign(interaction.guildId, name);
  return data ? { name, data } : null;
}

function resolveChar(data, userId) {
  return (data.characters || {})[userId] || null;
}

function getChar(interaction, data, targetUser = null) {
  const uid = targetUser ? targetUser.id : interaction.user.id;
  return { userId: uid, char: resolveChar(data, uid) };
}

// ───────────────────────────────────────────────────────────────
//  SLASH COMMAND DEFINITIONS
// ───────────────────────────────────────────────────────────────
const modeChoices = [
  { name: '🎲 Normal',              value: 'normal'  },
  { name: '🌟 Blessed (roll high)', value: 'blessed' },
  { name: '💀 Cursed  (roll low)',  value: 'cursed'  },
];
const abilityChoices = ABILITIES.map(a => ({ name: ABBR[a], value: a }));
const skillChoices   = Object.keys(SKILLS).map(s => ({
  name: s.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '), value: s,
}));

const commands = [

  // ── Campaign ──────────────────────────────────────────────
  new SlashCommandBuilder().setName('campaign').setDescription('Manage campaigns')
    .addSubcommand(s=>s.setName('create').setDescription('Create a new campaign')
      .addStringOption(o=>o.setName('name').setDescription('Campaign name').setRequired(true)))
    .addSubcommand(s=>s.setName('select').setDescription('Switch active campaign')
      .addStringOption(o=>o.setName('name').setDescription('Campaign name').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('List all campaigns'))
    .addSubcommand(s=>s.setName('info').setDescription('Show active campaign info'))
    .addSubcommand(s=>s.setName('rename').setDescription('Rename active campaign (DM)')
      .addStringOption(o=>o.setName('newname').setDescription('New name').setRequired(true)))
    .addSubcommand(s=>s.setName('delete').setDescription('Delete a campaign (DM)')
      .addStringOption(o=>o.setName('name').setDescription('Campaign name').setRequired(true))),

  // ── Character ─────────────────────────────────────────────
  new SlashCommandBuilder().setName('character').setDescription('Manage characters')
    .addSubcommand(s=>s.setName('create').setDescription('Create your character (opens form)'))
    .addSubcommand(s=>s.setName('sheet').setDescription('View character sheet')
      .addUserOption(o=>o.setName('player').setDescription('Another player (DM)')))
    .addSubcommand(s=>s.setName('edit').setDescription('Edit character details (opens form)'))
    .addSubcommand(s=>s.setName('delete').setDescription('Delete your character'))
    .addSubcommand(s=>s.setName('list').setDescription('List all characters in campaign')),

  // ── Set abilities ──────────────────────────────────────────
  new SlashCommandBuilder().setName('abilities').setDescription('Set all 6 ability scores (opens form)')
    .addUserOption(o=>o.setName('player').setDescription('Target player (DM)')),

  // ── HP ────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('hp').setDescription('Manage hit points')
    .addSubcommand(s=>s.setName('heal').setDescription('Heal HP')
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('damage').setDescription('Take damage')
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('set').setDescription('Set current HP')
      .addIntegerOption(o=>o.setName('value').setDescription('HP value').setRequired(true).setMinValue(0))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('setmax').setDescription('Set max HP')
      .addIntegerOption(o=>o.setName('value').setDescription('Max HP').setRequired(true).setMinValue(1))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('temp').setDescription('Set temporary HP')
      .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)'))),

  // ── AC / Speed / Initiative mod ───────────────────────────
  new SlashCommandBuilder().setName('stats').setDescription('Set combat stats')
    .addSubcommand(s=>s.setName('ac').setDescription('Set Armor Class')
      .addIntegerOption(o=>o.setName('value').setDescription('AC').setRequired(true).setMinValue(1).setMaxValue(30))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('speed').setDescription('Set movement speed')
      .addIntegerOption(o=>o.setName('value').setDescription('Speed in feet').setRequired(true).setMinValue(0).setMaxValue(200))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('initiative').setDescription('Set initiative modifier bonus')
      .addIntegerOption(o=>o.setName('value').setDescription('Bonus').setRequired(true).setMinValue(-10).setMaxValue(10))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)'))),

  // ── Dice ──────────────────────────────────────────────────
  new SlashCommandBuilder().setName('roll').setDescription('Roll any dice expression')
    .addStringOption(o=>o.setName('expression').setDescription('e.g. 2d6+3, 4d6kh3, d20').setRequired(true))
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices))
    .addStringOption(o=>o.setName('label').setDescription('Label for this roll')),

  new SlashCommandBuilder().setName('d4').setDescription('Roll d4')
    .addIntegerOption(o=>o.setName('count').setDescription('# of dice').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o=>o.setName('modifier').setDescription('Flat modifier'))
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices)),
  new SlashCommandBuilder().setName('d6').setDescription('Roll d6')
    .addIntegerOption(o=>o.setName('count').setDescription('# of dice').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o=>o.setName('modifier').setDescription('Flat modifier'))
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices)),
  new SlashCommandBuilder().setName('d8').setDescription('Roll d8')
    .addIntegerOption(o=>o.setName('count').setDescription('# of dice').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o=>o.setName('modifier').setDescription('Flat modifier'))
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices)),
  new SlashCommandBuilder().setName('d10').setDescription('Roll d10')
    .addIntegerOption(o=>o.setName('count').setDescription('# of dice').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o=>o.setName('modifier').setDescription('Flat modifier'))
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices)),
  new SlashCommandBuilder().setName('d12').setDescription('Roll d12')
    .addIntegerOption(o=>o.setName('count').setDescription('# of dice').setMinValue(1).setMaxValue(100))
    .addIntegerOption(o=>o.setName('modifier').setDescription('Flat modifier'))
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices)),
  new SlashCommandBuilder().setName('d20').setDescription('Roll d20')
    .addIntegerOption(o=>o.setName('modifier').setDescription('Flat modifier'))
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices))
    .addStringOption(o=>o.setName('label').setDescription('Label')),
  new SlashCommandBuilder().setName('d100').setDescription('Roll d100 / percentile')
    .addStringOption(o=>o.setName('mode').setDescription('Roll mode').addChoices(...modeChoices)),

  // ── Checks / Saves ────────────────────────────────────────
  new SlashCommandBuilder().setName('check').setDescription('Make a skill or ability check')
    .addSubcommand(s=>s.setName('skill').setDescription('Skill check')
      .addStringOption(o=>o.setName('skill').setDescription('Skill').setRequired(true).addChoices(...skillChoices))
      .addStringOption(o=>o.setName('mode').setDescription('Mode').addChoices(...modeChoices))
      .addIntegerOption(o=>o.setName('dc').setDescription('DC to beat'))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('ability').setDescription('Raw ability check')
      .addStringOption(o=>o.setName('ability').setDescription('Ability').setRequired(true).addChoices(...abilityChoices))
      .addStringOption(o=>o.setName('mode').setDescription('Mode').addChoices(...modeChoices))
      .addIntegerOption(o=>o.setName('dc').setDescription('DC to beat'))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)'))),

  new SlashCommandBuilder().setName('save').setDescription('Make a saving throw')
    .addStringOption(o=>o.setName('ability').setDescription('Ability').setRequired(true).addChoices(...abilityChoices))
    .addStringOption(o=>o.setName('mode').setDescription('Mode').addChoices(...modeChoices))
    .addIntegerOption(o=>o.setName('dc').setDescription('DC to beat'))
    .addUserOption(o=>o.setName('player').setDescription('Target (DM)')),

  // ── Attack ────────────────────────────────────────────────
  new SlashCommandBuilder().setName('attack').setDescription('Roll an attack')
    .addStringOption(o=>o.setName('weapon').setDescription('Weapon name (or use a saved attack)').setRequired(true))
    .addStringOption(o=>o.setName('tohit').setDescription('To-hit bonus e.g. +5  (auto if saved)'))
    .addStringOption(o=>o.setName('damage').setDescription('Damage expression e.g. 1d8+3  (auto if saved)'))
    .addStringOption(o=>o.setName('damagetype').setDescription('Damage type e.g. slashing'))
    .addStringOption(o=>o.setName('mode').setDescription('Mode').addChoices(...modeChoices)),

  // ── Attack management ──────────────────────────────────────
  new SlashCommandBuilder().setName('weapons').setDescription('Manage saved attacks')
    .addSubcommand(s=>s.setName('add').setDescription('Add attack (opens form)'))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove an attack')
      .addStringOption(o=>o.setName('name').setDescription('Attack name').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('List saved attacks')),

  // ── Death saves ───────────────────────────────────────────
  new SlashCommandBuilder().setName('deathsave').setDescription('Roll a death saving throw')
    .addStringOption(o=>o.setName('mode').setDescription('Mode').addChoices(...modeChoices))
    .addUserOption(o=>o.setName('player').setDescription('Target (DM)')),

  // ── Initiative ────────────────────────────────────────────
  new SlashCommandBuilder().setName('initiative').setDescription('Combat initiative tracker')
    .addSubcommand(s=>s.setName('roll').setDescription('Roll initiative for yourself')
      .addStringOption(o=>o.setName('mode').setDescription('Mode').addChoices(...modeChoices)))
    .addSubcommand(s=>s.setName('add').setDescription('Add a combatant manually (DM)')
      .addStringOption(o=>o.setName('name').setDescription('Name').setRequired(true))
      .addIntegerOption(o=>o.setName('value').setDescription('Initiative value').setRequired(true))
      .addIntegerOption(o=>o.setName('hp').setDescription('Current HP (optional)')))
    .addSubcommand(s=>s.setName('show').setDescription('Show initiative order'))
    .addSubcommand(s=>s.setName('next').setDescription('Advance to next turn (DM)'))
    .addSubcommand(s=>s.setName('hp').setDescription("Update a combatant's HP (DM)")
      .addStringOption(o=>o.setName('name').setDescription('Combatant name').setRequired(true))
      .addIntegerOption(o=>o.setName('hp').setDescription('New HP').setRequired(true)))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove combatant (DM)')
      .addStringOption(o=>o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(s=>s.setName('clear').setDescription('Clear tracker (DM)')),

  // ── Conditions ────────────────────────────────────────────
  new SlashCommandBuilder().setName('condition').setDescription('Apply or remove conditions')
    .addSubcommand(s=>s.setName('add').setDescription('Add a condition')
      .addStringOption(o=>o.setName('condition').setDescription('Condition').setRequired(true)
        .addChoices(...CONDITIONS_LIST.map(c=>({name:c,value:c}))))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove a condition')
      .addStringOption(o=>o.setName('condition').setDescription('Condition').setRequired(true)
        .addChoices(...CONDITIONS_LIST.map(c=>({name:c,value:c}))))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('clear').setDescription('Remove all conditions')
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('view').setDescription('View current conditions')
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  // ── Spells ────────────────────────────────────────────────
  new SlashCommandBuilder().setName('spells').setDescription('Manage spells & slots')
    .addSubcommand(s=>s.setName('add').setDescription('Add a known spell')
      .addStringOption(o=>o.setName('name').setDescription('Spell name').setRequired(true))
      .addIntegerOption(o=>o.setName('level').setDescription('Spell level (0=cantrip)').setMinValue(0).setMaxValue(9)))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove a known spell')
      .addStringOption(o=>o.setName('name').setDescription('Spell name').setRequired(true)))
    .addSubcommand(s=>s.setName('cast').setDescription('Use a spell slot')
      .addIntegerOption(o=>o.setName('level').setDescription('Slot level').setRequired(true).setMinValue(1).setMaxValue(9)))
    .addSubcommand(s=>s.setName('slots').setDescription('Set spell slots for a level (DM)')
      .addIntegerOption(o=>o.setName('level').setDescription('Slot level').setRequired(true).setMinValue(1).setMaxValue(9))
      .addIntegerOption(o=>o.setName('total').setDescription('Total slots').setRequired(true).setMinValue(0).setMaxValue(9))
      .addUserOption(o=>o.setName('player').setDescription('Target')))
    .addSubcommand(s=>s.setName('concentration').setDescription('Set concentration spell (blank to end)')
      .addStringOption(o=>o.setName('spell').setDescription('Spell name'))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('list').setDescription('List known spells')
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  // ── Inventory ─────────────────────────────────────────────
  new SlashCommandBuilder().setName('inventory').setDescription('Manage inventory')
    .addSubcommand(s=>s.setName('add').setDescription('Add an item')
      .addStringOption(o=>o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o=>o.setName('quantity').setDescription('Quantity').setMinValue(1))
      .addStringOption(o=>o.setName('notes').setDescription('Notes'))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove an item')
      .addStringOption(o=>o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o=>o.setName('quantity').setDescription('Quantity').setMinValue(1))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('view').setDescription('View inventory')
      .addUserOption(o=>o.setName('player').setDescription('Target')))
    .addSubcommand(s=>s.setName('clear').setDescription('Clear inventory (DM)')
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  // ── Currency ──────────────────────────────────────────────
  new SlashCommandBuilder().setName('currency').setDescription('Manage gold & coins')
    .addSubcommand(s=>s.setName('add').setDescription('Add currency')
      .addIntegerOption(o=>o.setName('gp').setDescription('Gold'))
      .addIntegerOption(o=>o.setName('sp').setDescription('Silver'))
      .addIntegerOption(o=>o.setName('cp').setDescription('Copper'))
      .addIntegerOption(o=>o.setName('pp').setDescription('Platinum'))
      .addIntegerOption(o=>o.setName('ep').setDescription('Electrum'))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('spend').setDescription('Spend currency')
      .addIntegerOption(o=>o.setName('gp').setDescription('Gold'))
      .addIntegerOption(o=>o.setName('sp').setDescription('Silver'))
      .addIntegerOption(o=>o.setName('cp').setDescription('Copper'))
      .addIntegerOption(o=>o.setName('pp').setDescription('Platinum'))
      .addIntegerOption(o=>o.setName('ep').setDescription('Electrum'))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('view').setDescription('View purse')
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  // ── Proficiencies / Expertise ─────────────────────────────
  new SlashCommandBuilder().setName('proficiency').setDescription('Manage proficiencies & expertise')
    .addSubcommand(s=>s.setName('addskill').setDescription('Add skill proficiency')
      .addStringOption(o=>o.setName('skill').setDescription('Skill').setRequired(true).addChoices(...skillChoices))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('removeskill').setDescription('Remove skill proficiency')
      .addStringOption(o=>o.setName('skill').setDescription('Skill').setRequired(true).addChoices(...skillChoices))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('expertise').setDescription('Toggle expertise in a skill')
      .addStringOption(o=>o.setName('skill').setDescription('Skill').setRequired(true).addChoices(...skillChoices))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('addsave').setDescription('Add saving throw proficiency')
      .addStringOption(o=>o.setName('ability').setDescription('Ability').setRequired(true).addChoices(...abilityChoices))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)')))
    .addSubcommand(s=>s.setName('removesave').setDescription('Remove saving throw proficiency')
      .addStringOption(o=>o.setName('ability').setDescription('Ability').setRequired(true).addChoices(...abilityChoices))
      .addUserOption(o=>o.setName('player').setDescription('Target (DM)'))),

  // ── Features ──────────────────────────────────────────────
  new SlashCommandBuilder().setName('features').setDescription('Manage class features & traits')
    .addSubcommand(s=>s.setName('add').setDescription('Add a feature (opens form)'))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove a feature')
      .addStringOption(o=>o.setName('name').setDescription('Feature name').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('List features')
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  // ── XP & Level ────────────────────────────────────────────
  new SlashCommandBuilder().setName('xp').setDescription('Manage XP and leveling')
    .addSubcommand(s=>s.setName('award').setDescription('Award XP (DM)')
      .addIntegerOption(o=>o.setName('amount').setDescription('XP to award').setRequired(true).setMinValue(1))
      .addUserOption(o=>o.setName('player').setDescription('Target (blank = all)')))
    .addSubcommand(s=>s.setName('view').setDescription('View XP progress')
      .addUserOption(o=>o.setName('player').setDescription('Target')))
    .addSubcommand(s=>s.setName('set').setDescription('Set XP directly (DM)')
      .addIntegerOption(o=>o.setName('amount').setDescription('Total XP').setRequired(true).setMinValue(0))
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  new SlashCommandBuilder().setName('levelup').setDescription('Level up a character (DM)')
    .addIntegerOption(o=>o.setName('hpgain').setDescription('HP gained').setRequired(true).setMinValue(1))
    .addUserOption(o=>o.setName('player').setDescription('Target (DM)')),

  // ── Rest ──────────────────────────────────────────────────
  new SlashCommandBuilder().setName('rest').setDescription('Take a rest')
    .addStringOption(o=>o.setName('type').setDescription('Rest type').setRequired(true)
      .addChoices({ name:'☀️ Short Rest', value:'short' }, { name:'🌙 Long Rest', value:'long' }))
    .addUserOption(o=>o.setName('player').setDescription('Target (DM, blank = self)')),

  // ── Inspiration ───────────────────────────────────────────
  new SlashCommandBuilder().setName('inspiration').setDescription('Manage inspiration')
    .addSubcommand(s=>s.setName('give').setDescription('Give inspiration (DM)')
      .addUserOption(o=>o.setName('player').setDescription('Target').setRequired(true)))
    .addSubcommand(s=>s.setName('use').setDescription('Use your inspiration'))
    .addSubcommand(s=>s.setName('status').setDescription('Check inspiration')
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  // ── Notes / Traits ────────────────────────────────────────
  new SlashCommandBuilder().setName('notes').setDescription('Character notes')
    .addSubcommand(s=>s.setName('set').setDescription('Set notes (opens form)'))
    .addSubcommand(s=>s.setName('view').setDescription('View notes')
      .addUserOption(o=>o.setName('player').setDescription('Target'))),

  new SlashCommandBuilder().setName('traits').setDescription('Set personality traits (opens form)')
    .addUserOption(o=>o.setName('player').setDescription('Target (DM)')),

  // ── Party ─────────────────────────────────────────────────
  new SlashCommandBuilder().setName('party').setDescription('Show party overview'),

  // ── Loot ──────────────────────────────────────────────────
  new SlashCommandBuilder().setName('loot').setDescription('Distribute loot to the party (DM)')
    .addStringOption(o=>o.setName('items').setDescription('Comma-separated items (enter "none" for currency only)').setRequired(true))
    .addIntegerOption(o=>o.setName('gp').setDescription('Gold to split'))
    .addIntegerOption(o=>o.setName('sp').setDescription('Silver to split'))
    .addIntegerOption(o=>o.setName('cp').setDescription('Copper to split'))
    .addIntegerOption(o=>o.setName('pp').setDescription('Platinum to split')),

  // ── DM Tools ──────────────────────────────────────────────
  new SlashCommandBuilder().setName('dm').setDescription('DM-only tools')
    .addSubcommand(s=>s.setName('roll').setDescription('Secret dice roll (ephemeral)')
      .addStringOption(o=>o.setName('expression').setDescription('Expression').setRequired(true))
      .addStringOption(o=>o.setName('mode').setDescription('Mode').addChoices(...modeChoices))
      .addStringOption(o=>o.setName('label').setDescription('Label')))
    .addSubcommand(s=>s.setName('npc').setDescription('Quick NPC stat block')
      .addStringOption(o=>o.setName('name').setDescription('NPC name').setRequired(true))
      .addStringOption(o=>o.setName('cr').setDescription('Challenge Rating e.g. 1/4, 2, 10').setRequired(true))
      .addStringOption(o=>o.setName('type').setDescription('Creature type')))
    .addSubcommand(s=>s.setName('xpbudget').setDescription('Encounter XP budget')
      .addIntegerOption(o=>o.setName('players').setDescription('# of players').setRequired(true).setMinValue(1).setMaxValue(10))
      .addIntegerOption(o=>o.setName('level').setDescription('Average party level').setRequired(true).setMinValue(1).setMaxValue(20)))
    .addSubcommand(s=>s.setName('grouproll').setDescription('Roll initiative for a group')
      .addStringOption(o=>o.setName('name').setDescription('Enemy name').setRequired(true))
      .addIntegerOption(o=>o.setName('count').setDescription('# of enemies').setRequired(true).setMinValue(1).setMaxValue(20))
      .addIntegerOption(o=>o.setName('modifier').setDescription('Initiative modifier')))
    .addSubcommand(s=>s.setName('setlevel').setDescription('Force-set character level')
      .addIntegerOption(o=>o.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(20))
      .addUserOption(o=>o.setName('player').setDescription('Target').setRequired(true))),

  // ── Reference ─────────────────────────────────────────────
  new SlashCommandBuilder().setName('ref').setDescription('Quick 5e reference')
    .addSubcommand(s=>s.setName('condition').setDescription('Look up a condition')
      .addStringOption(o=>o.setName('name').setDescription('Condition').setRequired(true)
        .addChoices(...CONDITIONS_LIST.map(c=>({name:c,value:c})))))
    .addSubcommand(s=>s.setName('action').setDescription('Look up an action')
      .addStringOption(o=>o.setName('name').setDescription('Action').setRequired(true)
        .addChoices(...Object.keys(ACTION_DESC).map(a=>({name:a,value:a})))))
    .addSubcommand(s=>s.setName('xptable').setDescription('XP & proficiency table'))
    .addSubcommand(s=>s.setName('spellslots').setDescription('Spell slots by level')
      .addStringOption(o=>o.setName('caster').setDescription('Caster type').setRequired(true)
        .addChoices(
          {name:'Full Caster (Wizard/Cleric/Druid/Bard/Sorcerer)',value:'full'},
          {name:'Half Caster (Paladin/Ranger)',value:'half'},
          {name:'Warlock (Pact Magic)',value:'warlock'},
          {name:'Third Caster (EK / AT)',value:'third'},
        )))
    .addSubcommand(s=>s.setName('abilities').setDescription('Ability score reference')),

  // ── Schedule ──────────────────────────────────────────────
  new SlashCommandBuilder().setName('schedule').setDescription('Post a session announcement')
    .addStringOption(o=>o.setName('date').setDescription('Date  e.g. Saturday May 10th').setRequired(true))
    .addStringOption(o=>o.setName('time').setDescription('Time  e.g. 7:00 PM EST').setRequired(true))
    .addStringOption(o=>o.setName('title').setDescription('Session title'))
    .addStringOption(o=>o.setName('notes').setDescription('Notes or description')),

].map(c => c.toJSON());

// ───────────────────────────────────────────────────────────────
//  CLIENT
// ───────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`[DnD Bot] Online as ${client.user.tag}`);
  ensureDir(CAMPAIGN_DIR);
  const rest = new REST({ version:'10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[DnD Bot] Commands registered.');
  } catch (e) { console.error('[DnD Bot] Registration error:', e); }
});

// ───────────────────────────────────────────────────────────────
//  SHARED INTERACTION HELPERS
// ───────────────────────────────────────────────────────────────
async function noCamp(i)   { await i.reply({ embeds:[errorEmbed('No active campaign. Use `/campaign select` first.')], ephemeral:true }); }
async function noChar(i)   { await i.reply({ embeds:[errorEmbed('No character found. Create one with `/character create`.')], ephemeral:true }); }
async function noDM(i)     { await i.reply({ embeds:[errorEmbed('Only a **DM** can do that.')], ephemeral:true }); }
async function noPlayer(i) { await i.reply({ embeds:[errorEmbed('You need the **Player** or **DM** role.')], ephemeral:true }); }

function applyHPChange(char, sub, amount) {
  if (sub === 'heal') {
    char.hp.current = Math.min(char.hp.current + amount, char.hp.max);
  } else if (sub === 'damage') {
    let dmg = amount;
    if (char.hp.temp > 0) {
      const abs = Math.min(char.hp.temp, dmg);
      char.hp.temp -= abs;
      dmg -= abs;
    }
    char.hp.current = Math.max(0, char.hp.current - dmg);
  } else if (sub === 'set') {
    char.hp.current = Math.min(amount, char.hp.max);
  } else if (sub === 'setmax') {
    char.hp.max = amount;
    char.hp.current = Math.min(char.hp.current, char.hp.max);
  } else if (sub === 'temp') {
    char.hp.temp = Math.max(char.hp.temp, amount);
  }
}

function hpEmbed(char) {
  const { current: c, max: m, temp: t } = char.hp;
  const bar    = hpBar(c, m);
  const status = c === 0 ? `${EMOJI.skull} **Downed**` : c <= Math.floor(m*0.25) ? `${EMOJI.warn} **Bloodied**` : `${EMOJI.heart} Healthy`;
  return new EmbedBuilder()
    .setColor(c === 0 ? CLR.red : c <= Math.floor(m*0.25) ? CLR.orange : CLR.green)
    .setTitle(`${EMOJI.heart}  ${char.name}  —  HP`)
    .setDescription(`${bar}\n**${c} / ${m}**${t?` *(+${t} temp)*`:''}\n${status}`);
}

async function doDeathSave(i, char, mode, campName, guildId) {
  const r   = executeRoll('1d20', mode);
  const nat = r.final[0];
  if (!char.deathSaves) char.deathSaves = { successes:0, failures:0 };

  let resultLine = '', outcome = '';
  if (nat === 20) {
    char.hp.current = 1;
    char.deathSaves = { successes:0, failures:0 };
    resultLine = `${EMOJI.star} **Natural 20 — Back from the brink! 1 HP restored.**`;
  } else if (nat === 1) {
    char.deathSaves.failures = Math.min(3, char.deathSaves.failures + 2);
    resultLine = `${EMOJI.skull} **Natural 1 — Two failures!**`;
  } else if (r.sum >= 10) {
    char.deathSaves.successes++;
    resultLine = `${EMOJI.check} Success (${char.deathSaves.successes}/3)`;
  } else {
    char.deathSaves.failures++;
    resultLine = `${EMOJI.cross} Failure (${char.deathSaves.failures}/3)`;
  }

  if (char.deathSaves.successes >= 3) {
    outcome = `\n${EMOJI.sparkle} **Stabilized!**`;
    char.deathSaves = { successes:0, failures:0 };
  }
  if (char.deathSaves.failures >= 3) {
    outcome = `\n${EMOJI.skull} **The character has died.**`;
  }

  const embed = new EmbedBuilder()
    .setColor(nat >= 10 ? CLR.green : CLR.red)
    .setTitle(`${EMOJI.skull}  Death Save  —  ${char.name}`)
    .addFields(
      { name: 'Roll', value: `\`d20 → ${nat}\` (**${r.sum}**)`, inline: true },
      { name: 'Result', value: resultLine + outcome, inline: false },
      { name: '✅ Successes', value: `${'◉'.repeat(char.deathSaves.successes)}${'◎'.repeat(3-char.deathSaves.successes)}`, inline: true },
      { name: '❌ Failures',  value: `${'◉'.repeat(char.deathSaves.failures)}${'◎'.repeat(3-char.deathSaves.failures)}`, inline: true },
    );
  if (r.note) embed.setFooter({ text: r.note });
  return embed;
}

// ───────────────────────────────────────────────────────────────
//  MAIN INTERACTION ROUTER
// ───────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

  // ── MODALS ──────────────────────────────────────────────────
  if (interaction.type === InteractionType.ModalSubmit) {
    await handleModal(interaction);
    return;
  }

  // ── BUTTONS ─────────────────────────────────────────────────
  if (interaction.isButton()) {
    await handleButton(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName: cmd } = interaction;
  const sub = interaction.options.getSubcommand?.(false);

  // ── CAMPAIGN ─────────────────────────────────────────────────
  if (cmd === 'campaign') {
    if (sub === 'create') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const name = interaction.options.getString('name');
      if (fs.existsSync(campaignPath(interaction.guildId, name)))
        return interaction.reply({ embeds:[errorEmbed(`Campaign **${name}** already exists.`)], ephemeral:true });
      const data = {
        name, createdAt: new Date().toISOString(), dmId: interaction.user.id,
        characters:{}, initiative:[], initiativeTurn:0, round:1,
      };
      saveCampaign(interaction.guildId, name, data);
      setActive(interaction.guildId, name);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.crown}  Campaign Created`)
          .setDescription(`**${name}** is ready.\nDM: <@${interaction.user.id}>`)
          .setFooter({ text: 'Set as active campaign.' }),
      ]});
    }

    if (sub === 'select') {
      const name = interaction.options.getString('name');
      if (!loadCampaign(interaction.guildId, name))
        return interaction.reply({ embeds:[errorEmbed(`No campaign named **${name}**.`)], ephemeral:true });
      setActive(interaction.guildId, name);
      return interaction.reply({ embeds:[successEmbed(`Switched to **${name}**.`)] });
    }

    if (sub === 'list') {
      const list   = listCampaigns(interaction.guildId);
      const active = getActive(interaction.guildId);
      if (!list.length)
        return interaction.reply({ embeds:[errorEmbed('No campaigns yet. Create one with `/campaign create`.')], ephemeral:true });
      const desc = list.map(c => `${c === active ? '▶️' : '　'} **${c}**`).join('\n');
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.book}  Campaigns`).setDescription(desc),
      ]});
    }

    if (sub === 'info') {
      const res = getActiveCamp(interaction);
      if (!res) return noCamp(interaction);
      const { name, data } = res;
      const chars = Object.values(data.characters || {});
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.book}  ${name}`)
          .addFields(
            { name: `${EMOJI.crown} DM`,        value: `<@${data.dmId}>`, inline:true },
            { name: '🗺️ Characters',            value: `${chars.length}`, inline:true },
            { name: '⚔️ Round',                 value: `${data.round || 1}`, inline:true },
            { name: '📜 Party',                 value: chars.length
              ? chars.map(c=>`**${c.name}** — ${c.race} ${c.class} Lv.${c.level}`).join('\n')
              : '*No characters yet.*', inline:false },
          ),
      ]});
    }

    if (sub === 'rename') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const res = getActiveCamp(interaction);
      if (!res) return noCamp(interaction);
      const newName = interaction.options.getString('newname');
      const oldPath = campaignPath(interaction.guildId, res.name);
      res.data.name = newName;
      saveCampaign(interaction.guildId, newName, res.data);
      fs.unlinkSync(oldPath);
      setActive(interaction.guildId, newName);
      return interaction.reply({ embeds:[successEmbed(`Campaign renamed to **${newName}**.`)] });
    }

    if (sub === 'delete') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const name = interaction.options.getString('name');
      const p    = campaignPath(interaction.guildId, name);
      if (!fs.existsSync(p))
        return interaction.reply({ embeds:[errorEmbed(`No campaign named **${name}**.`)], ephemeral:true });
      fs.unlinkSync(p);
      gitCommit(`chore: delete campaign "${name}"`);
      if (getActive(interaction.guildId) === name) delete activeMap[interaction.guildId];
      return interaction.reply({ embeds:[successEmbed(`Campaign **${name}** deleted.`)] });
    }
  }

  // ── CHARACTER ─────────────────────────────────────────────────
  if (cmd === 'character') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;

    if (sub === 'create') {
      if (!isPlayer(interaction.member)) return noPlayer(interaction);
      const modal = new ModalBuilder()
        .setCustomId(`char_create_${campName}`)
        .setTitle('Create Character')
        .addComponents(
          new ActionRowBuilder().addComponents(textInput('charname','Character Name','Aria Moonwhisper')),
          new ActionRowBuilder().addComponents(textInput('race','Race','Elf, Human, Tiefling…')),
          new ActionRowBuilder().addComponents(textInput('class','Class','Fighter, Wizard, Rogue…')),
          new ActionRowBuilder().addComponents(textInput('level','Starting Level','1')),
          new ActionRowBuilder().addComponents(textInput('background','Background (optional)','Soldier, Sage…',TextInputStyle.Short,false)),
        );
      return interaction.showModal(modal);
    }

    if (sub === 'sheet') {
      const target = interaction.options.getUser('player');
      if (target && !isDM(interaction.member)) return noDM(interaction);
      const { char } = getChar(interaction, data, target);
      if (!char) return noChar(interaction);
      return interaction.reply({ embeds:[charSheetEmbed(char)], components:[hpButtons(char.userId)] });
    }

    if (sub === 'edit') {
      const { char } = getChar(interaction, data);
      if (!char) return noChar(interaction);
      const modal = new ModalBuilder()
        .setCustomId(`char_edit_${campName}`)
        .setTitle(`Edit: ${char.name}`)
        .addComponents(
          new ActionRowBuilder().addComponents(textInput('subclass','Subclass (optional)','e.g. School of Evocation',TextInputStyle.Short,false,char.subclass||'')),
          new ActionRowBuilder().addComponents(textInput('background','Background',char.background||'Soldier',TextInputStyle.Short,false,char.background||'')),
          new ActionRowBuilder().addComponents(textInput('alignment','Alignment',char.alignment||'True Neutral',TextInputStyle.Short,false,char.alignment||'')),
          new ActionRowBuilder().addComponents(textInput('languages','Languages (comma separated)',char.proficiencies?.languages?.join(', ')||'Common',TextInputStyle.Short,false,char.proficiencies?.languages?.join(', ')||'Common')),
        );
      return interaction.showModal(modal);
    }

    if (sub === 'delete') {
      if (!data.characters?.[interaction.user.id])
        return interaction.reply({ embeds:[errorEmbed('You have no character to delete.')], ephemeral:true });
      delete data.characters[interaction.user.id];
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed('Character deleted.')] });
    }

    if (sub === 'list') {
      const chars = Object.values(data.characters || {});
      if (!chars.length)
        return interaction.reply({ embeds:[errorEmbed('No characters in this campaign yet.')], ephemeral:true });
      const embed = new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.scroll}  Characters — ${campName}`);
      for (const c of chars) {
        embed.addFields({ name: `${c.name}`, value:
          `${c.race} ${c.class} Lv.${c.level}  ·  HP **${c.hp.current}/${c.hp.max}**  ·  AC **${c.ac}**`,
          inline:false });
      }
      return interaction.reply({ embeds:[embed] });
    }
  }

  // ── ABILITIES (form) ──────────────────────────────────────────
  if (cmd === 'abilities') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, res.data, target);
    if (!char) return noChar(interaction);
    const a = char.abilities;
    const modal = new ModalBuilder()
      .setCustomId(`abilities_${res.name}_${char.userId}`)
      .setTitle(`Ability Scores — ${char.name}`)
      .addComponents(
        new ActionRowBuilder().addComponents(textInput('str','Strength',`${a.strength}`,TextInputStyle.Short,true,`${a.strength}`)),
        new ActionRowBuilder().addComponents(textInput('dex','Dexterity',`${a.dexterity}`,TextInputStyle.Short,true,`${a.dexterity}`)),
        new ActionRowBuilder().addComponents(textInput('con','Constitution',`${a.constitution}`,TextInputStyle.Short,true,`${a.constitution}`)),
        new ActionRowBuilder().addComponents(textInput('int','Intelligence',`${a.intelligence}`,TextInputStyle.Short,true,`${a.intelligence}`)),
        new ActionRowBuilder().addComponents(textInput('wis','Wisdom',`${a.wisdom}`,TextInputStyle.Short,true,`${a.wisdom}`)),
      );
    // Discord only allows 5 rows — CHA handled separately via a follow-up or noted
    return interaction.showModal(modal);
  }

  // ── HP ─────────────────────────────────────────────────────────
  if (cmd === 'hp') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { userId, char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    const amount = interaction.options.getInteger('amount') ?? interaction.options.getInteger('value');
    applyHPChange(char, sub, amount);
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[hpEmbed(char)], components:[hpButtons(userId)] });
  }

  // ── STATS ──────────────────────────────────────────────────────
  if (cmd === 'stats') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    const val = interaction.options.getInteger('value');
    if (sub === 'ac')         char.ac        = val;
    if (sub === 'speed')      char.speed     = val;
    if (sub === 'initiative') char.initiative = val;
    saveCampaign(interaction.guildId, campName, data);
    const label = sub === 'ac' ? `AC → **${val}**` : sub === 'speed' ? `Speed → **${val} ft**` : `Init modifier → **${modStr(val)}**`;
    return interaction.reply({ embeds:[successEmbed(`**${char.name}** — ${label}`)] });
  }

  // ── ROLL ───────────────────────────────────────────────────────
  if (cmd === 'roll') {
    const expr   = interaction.options.getString('expression');
    const mode   = interaction.options.getString('mode') || 'normal';
    const label  = interaction.options.getString('label') || expr;
    const result = executeRoll(expr, mode);
    if (!result) return interaction.reply({ embeds:[errorEmbed(`Invalid expression: \`${expr}\``)], ephemeral:true });
    return interaction.reply({ embeds:[rollEmbed(label, expr, result, mode)] });
  }

  // ── QUICK DICE ─────────────────────────────────────────────────
  const QUICK = { d4:4, d6:6, d8:8, d10:10, d12:12, d20:20, d100:100 };
  if (QUICK[cmd]) {
    const sides = QUICK[cmd];
    const count = interaction.options.getInteger('count') || 1;
    const mod   = interaction.options.getInteger('modifier') || 0;
    const mode  = interaction.options.getString('mode') || 'normal';
    const label = interaction.options.getString('label') || `${count}d${sides}`;
    const expr  = `${count}d${sides}${mod>0?`+${mod}`:mod<0?`${mod}`:''}`;
    const result = executeRoll(expr, mode);
    if (!result) return interaction.reply({ embeds:[errorEmbed('Roll failed.')], ephemeral:true });
    return interaction.reply({ embeds:[rollEmbed(label, expr, result, mode)] });
  }

  // ── CHECK ──────────────────────────────────────────────────────
  if (cmd === 'check') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    const mode = interaction.options.getString('mode') || 'normal';
    const dc   = interaction.options.getInteger('dc');

    let bonus, label, expr;
    if (sub === 'skill') {
      const skill = interaction.options.getString('skill');
      bonus = skillBonus(char, skill);
      label = `${char.name}  —  ${skill.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')} Check`;
    } else {
      const ability = interaction.options.getString('ability');
      bonus = abilMod(char.abilities[ability] || 10);
      label = `${char.name}  —  ${ABBR[ability]} Check`;
    }
    expr = `1d20${bonus>=0?`+${bonus}`:bonus}`;
    const result = executeRoll(expr, mode);
    const embed  = rollEmbed(label, expr, result, mode);
    if (dc) {
      const pass = result.sum >= dc;
      embed.addFields({ name:`DC ${dc}`, value: pass ? `${EMOJI.check} **Success!**` : `${EMOJI.cross} **Failure**`, inline:true });
      embed.setColor(pass ? CLR.green : CLR.red);
    }
    return interaction.reply({ embeds:[embed] });
  }

  // ── SAVE ───────────────────────────────────────────────────────
  if (cmd === 'save') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { data } = res;
    const target  = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    const ability = interaction.options.getString('ability');
    const mode    = interaction.options.getString('mode') || 'normal';
    const dc      = interaction.options.getInteger('dc');
    const bonus   = saveBonus(char, ability);
    const expr    = `1d20${bonus>=0?`+${bonus}`:bonus}`;
    const result  = executeRoll(expr, mode);
    const label   = `${char.name}  —  ${ABBR[ability]} Save`;
    const embed   = rollEmbed(label, expr, result, mode);
    if (dc) {
      const pass = result.sum >= dc;
      embed.addFields({ name:`DC ${dc}`, value: pass ? `${EMOJI.check} **Success!**` : `${EMOJI.cross} **Failure**`, inline:true });
      embed.setColor(pass ? CLR.green : CLR.red);
    }
    return interaction.reply({ embeds:[embed] });
  }

  // ── ATTACK ─────────────────────────────────────────────────────
  if (cmd === 'attack') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { char } = getChar(interaction, res.data);
    const weaponName = interaction.options.getString('weapon');
    const mode       = interaction.options.getString('mode') || 'normal';

    // try to find saved attack
    const saved = char?.attacks?.find(a => a.name.toLowerCase() === weaponName.toLowerCase());
    const toHitS  = interaction.options.getString('tohit') || saved?.toHit || '+0';
    const damExpr = interaction.options.getString('damage') || saved?.damage;
    const damType = interaction.options.getString('damagetype') || saved?.type || '';

    const toHitN  = parseInt(toHitS.replace('+','')) || 0;
    const atkExpr = `1d20${toHitN>=0?`+${toHitN}`:toHitN}`;
    const atkRes  = executeRoll(atkExpr, mode);
    const damRes  = damExpr ? executeRoll(damExpr, 'normal') : null;

    return interaction.reply({ embeds:[attackEmbed(weaponName, atkRes, damRes, mode, damType)] });
  }

  // ── WEAPONS (manage) ───────────────────────────────────────────
  if (cmd === 'weapons') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const { char } = getChar(interaction, data);
    if (!char) return noChar(interaction);

    if (sub === 'add') {
      const modal = new ModalBuilder()
        .setCustomId(`weapon_add_${campName}`)
        .setTitle('Add Attack')
        .addComponents(
          new ActionRowBuilder().addComponents(textInput('wname','Attack Name','Longsword')),
          new ActionRowBuilder().addComponents(textInput('tohit','To-Hit Bonus','+5')),
          new ActionRowBuilder().addComponents(textInput('damage','Damage','1d8+3')),
          new ActionRowBuilder().addComponents(textInput('dtype','Damage Type','slashing',TextInputStyle.Short,false)),
        );
      return interaction.showModal(modal);
    }
    if (sub === 'remove') {
      const name = interaction.options.getString('name');
      char.attacks = (char.attacks||[]).filter(a=>a.name.toLowerCase()!==name.toLowerCase());
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`Attack **${name}** removed.`)] });
    }
    if (sub === 'list') {
      if (!char.attacks?.length)
        return interaction.reply({ embeds:[errorEmbed('No saved attacks.')], ephemeral:true });
      const embed = new EmbedBuilder().setColor(CLR.blue).setTitle(`${EMOJI.sword}  ${char.name}'s Attacks`)
        .setDescription(char.attacks.map(a=>`**${a.name}** — ${a.toHit} to hit · ${a.damage}${a.type?` *${a.type}*`:''}`).join('\n'));
      return interaction.reply({ embeds:[embed] });
    }
  }

  // ── DEATH SAVE ─────────────────────────────────────────────────
  if (cmd === 'deathsave') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { userId, char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    const mode  = interaction.options.getString('mode') || 'normal';
    const embed = await doDeathSave(interaction, char, mode, campName, interaction.guildId);
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[embed], components:[deathSaveButtons(userId)] });
  }

  // ── INITIATIVE ─────────────────────────────────────────────────
  if (cmd === 'initiative') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    if (!data.initiative) data.initiative = [];
    if (data.initiativeTurn === undefined) data.initiativeTurn = 0;
    if (!data.round) data.round = 1;

    if (sub === 'roll') {
      if (!isPlayer(interaction.member)) return noPlayer(interaction);
      const { char } = getChar(interaction, data);
      if (!char) return noChar(interaction);
      const mode   = interaction.options.getString('mode') || 'normal';
      const dexMod = abilMod(char.abilities.dexterity || 10);
      const bonus  = dexMod + (char.initiative || 0);
      const expr   = `1d20${bonus>=0?`+${bonus}`:bonus}`;
      const result = executeRoll(expr, mode);
      data.initiative = data.initiative.filter(e=>e.userId!==interaction.user.id);
      data.initiative.push({ name:char.name, userId:interaction.user.id, value:result.sum, roll:result.final[0], hp:char.hp.current });
      data.initiative.sort((a,b)=>b.value-a.value || b.roll-a.roll);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.blue).setTitle(`${EMOJI.dice}  Initiative — ${char.name}`)
          .setDescription(`Rolled **${result.sum}** *(${result.final[0]} on d20, ${modStr(bonus)} mod)*`),
        initiativeEmbed(campName, data),
      ], components:[initiativeButtons()] });
    }

    if (sub === 'add') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const name  = interaction.options.getString('name');
      const value = interaction.options.getInteger('value');
      const hp    = interaction.options.getInteger('hp') || null;
      data.initiative.push({ name, value, userId:null, roll:0, hp });
      data.initiative.sort((a,b)=>b.value-a.value || b.roll-a.roll);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
    }

    if (sub === 'show') {
      return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
    }

    if (sub === 'next') {
      if (!isDM(interaction.member)) return noDM(interaction);
      if (!data.initiative.length)
        return interaction.reply({ embeds:[errorEmbed('Initiative tracker is empty.')], ephemeral:true });
      data.initiativeTurn = (data.initiativeTurn + 1) % data.initiative.length;
      if (data.initiativeTurn === 0) data.round++;
      saveCampaign(interaction.guildId, campName, data);
      const current = data.initiative[data.initiativeTurn];
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.red).setTitle(`${EMOJI.sword}  ${current.name}'s Turn`)
          .setDescription(`Round **${data.round}**`),
        initiativeEmbed(campName, data),
      ], components:[initiativeButtons()] });
    }

    if (sub === 'hp') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const name = interaction.options.getString('name');
      const hp   = interaction.options.getInteger('hp');
      const entry = data.initiative.find(e=>e.name.toLowerCase()===name.toLowerCase());
      if (!entry) return interaction.reply({ embeds:[errorEmbed(`No combatant named **${name}**.`)], ephemeral:true });
      entry.hp = hp;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
    }

    if (sub === 'remove') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const name = interaction.options.getString('name');
      data.initiative = data.initiative.filter(e=>e.name.toLowerCase()!==name.toLowerCase());
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
    }

    if (sub === 'clear') {
      if (!isDM(interaction.member)) return noDM(interaction);
      data.initiative = []; data.initiativeTurn = 0; data.round = 1;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed('Initiative tracker cleared.')] });
    }
  }

  // ── CONDITIONS ─────────────────────────────────────────────────
  if (cmd === 'condition') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    if (!char.conditions) char.conditions = [];

    if (sub === 'add') {
      const cond = interaction.options.getString('condition');
      if (!char.conditions.includes(cond)) char.conditions.push(cond);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.orange).setTitle(`${EMOJI.warn}  ${char.name}  —  ${cond}`)
          .setDescription(CONDITION_DESC[cond] || ''),
      ]});
    }
    if (sub === 'remove') {
      const cond = interaction.options.getString('condition');
      char.conditions = char.conditions.filter(c=>c!==cond);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${cond}** removed from **${char.name}**.`)] });
    }
    if (sub === 'clear') {
      char.conditions = [];
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`All conditions cleared from **${char.name}**.`)] });
    }
    if (sub === 'view') {
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.main).setTitle(`${EMOJI.warn}  ${char.name}  —  Conditions`)
          .setDescription(conditionBadges(char.conditions)),
      ]});
    }
  }

  // ── SPELLS ─────────────────────────────────────────────────────
  if (cmd === 'spells') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    if (!char.spells) char.spells = { slots:{}, known:[], concentration:null };

    if (sub === 'add') {
      const sname = interaction.options.getString('name');
      const slvl  = interaction.options.getInteger('level') ?? 0;
      if (!char.spells.known.find(s=>s.name.toLowerCase()===sname.toLowerCase()))
        char.spells.known.push({ name:sname, level:slvl });
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${sname}** (Lv${slvl}) added to ${char.name}'s spell list.`)] });
    }
    if (sub === 'remove') {
      const sname = interaction.options.getString('name');
      char.spells.known = char.spells.known.filter(s=>s.name.toLowerCase()!==sname.toLowerCase());
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${sname}** removed.`)] });
    }
    if (sub === 'cast') {
      const lvl  = interaction.options.getInteger('level');
      const slot = char.spells.slots[lvl];
      if (!slot || slot.used >= slot.total)
        return interaction.reply({ embeds:[errorEmbed(`No level **${lvl}** spell slots remaining.`)], ephemeral:true });
      slot.used++;
      saveCampaign(interaction.guildId, campName, data);
      const dots = '◉'.repeat(slot.total - slot.used) + '◎'.repeat(slot.used);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.purple).setTitle(`${EMOJI.magic}  Spell Cast — Level ${lvl}`)
          .setDescription(`**${char.name}** used a level ${lvl} slot.\n${dots}  (${slot.total - slot.used}/${slot.total} remaining)`),
      ]});
    }
    if (sub === 'slots') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const lvl   = interaction.options.getInteger('level');
      const total = interaction.options.getInteger('total');
      char.spells.slots[lvl] = { total, used: char.spells.slots[lvl]?.used || 0 };
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`${char.name}'s level ${lvl} slots set to **${total}**.`)] });
    }
    if (sub === 'concentration') {
      const spell = interaction.options.getString('spell') || null;
      char.spells.concentration = spell;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(spell ? `**${char.name}** is concentrating on **${spell}**.` : `**${char.name}** ended concentration.`)] });
    }
    if (sub === 'list') {
      const known = char.spells.known || [];
      if (!known.length)
        return interaction.reply({ embeds:[errorEmbed(`${char.name} has no known spells.`)], ephemeral:true });
      const byLevel = {};
      for (const s of known) { if (!byLevel[s.level]) byLevel[s.level]=[]; byLevel[s.level].push(s.name); }
      const lines = Object.entries(byLevel).sort(([a],[b])=>+a-+b)
        .map(([lvl,names]) => `**${+lvl===0?'Cantrips':`Level ${lvl}`}:** ${names.join(', ')}`);
      const slotInfo = Object.entries(char.spells.slots||{}).filter(([,v])=>v.total>0)
        .map(([lvl,v])=>`L${lvl}: ${'◉'.repeat(v.total-v.used)}${'◎'.repeat(v.used)}`).join('  ');
      const embed = new EmbedBuilder().setColor(CLR.purple)
        .setTitle(`${EMOJI.magic}  ${char.name}'s Spells`)
        .setDescription(lines.join('\n'));
      if (slotInfo) embed.addFields({ name:'Spell Slots', value:slotInfo });
      if (char.spells.concentration) embed.addFields({ name:'🌀 Concentration', value:`*${char.spells.concentration}*` });
      return interaction.reply({ embeds:[embed] });
    }
  }

  // ── INVENTORY ──────────────────────────────────────────────────
  if (cmd === 'inventory') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    if (!char.inventory) char.inventory = [];

    if (sub === 'add') {
      const iname = interaction.options.getString('name');
      const qty   = interaction.options.getInteger('quantity') || 1;
      const notes = interaction.options.getString('notes') || '';
      const ex    = char.inventory.find(i=>i.name.toLowerCase()===iname.toLowerCase());
      if (ex) ex.qty += qty;
      else char.inventory.push({ name:iname, qty, notes });
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`Added **${qty}× ${iname}** to ${char.name}'s inventory.`)] });
    }
    if (sub === 'remove') {
      const iname = interaction.options.getString('name');
      const qty   = interaction.options.getInteger('quantity') || 1;
      const idx   = char.inventory.findIndex(i=>i.name.toLowerCase()===iname.toLowerCase());
      if (idx===-1) return interaction.reply({ embeds:[errorEmbed(`**${iname}** not in inventory.`)], ephemeral:true });
      char.inventory[idx].qty -= qty;
      if (char.inventory[idx].qty <= 0) char.inventory.splice(idx,1);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`Removed **${qty}× ${iname}** from ${char.name}.`)] });
    }
    if (sub === 'view') {
      if (!char.inventory.length)
        return interaction.reply({ embeds:[new EmbedBuilder().setColor(CLR.main).setTitle(`${EMOJI.bag}  ${char.name}'s Inventory`).setDescription('*Empty.*')] });
      const embed = new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.bag}  ${char.name}'s Inventory`)
        .setDescription(char.inventory.map(i=>`• **${i.name}** ×${i.qty}${i.notes?` *(${i.notes})*`:''}`).join('\n'));
      return interaction.reply({ embeds:[embed] });
    }
    if (sub === 'clear') {
      if (!isDM(interaction.member)) return noDM(interaction);
      char.inventory = [];
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`${char.name}'s inventory cleared.`)] });
    }
  }

  // ── CURRENCY ────────────────────────────────────────────────────
  if (cmd === 'currency') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    if (!char.currency) char.currency = { cp:0,sp:0,ep:0,gp:0,pp:0 };

    if (sub === 'view')
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.gold}  ${char.name}'s Purse`)
          .setDescription(coinStr(char.currency)),
      ]});

    const sign = sub==='add' ? 1 : -1;
    for (const coin of ['cp','sp','ep','gp','pp']) {
      const amt = interaction.options.getInteger(coin) || 0;
      char.currency[coin] = Math.max(0, (char.currency[coin]||0) + sign * amt);
    }
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[
      new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.gold}  ${char.name}'s Purse`)
        .setDescription(coinStr(char.currency)),
    ]});
  }

  // ── PROFICIENCY ─────────────────────────────────────────────────
  if (cmd === 'proficiency') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    if (!char.proficiencies) char.proficiencies = { skills:[], saves:[], armor:[], weapons:[], tools:[], languages:[] };
    if (!char.expertises) char.expertises = [];

    if (sub === 'addskill') {
      const skill = interaction.options.getString('skill');
      if (!char.proficiencies.skills.includes(skill)) char.proficiencies.skills.push(skill);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${char.name}** gained proficiency in **${skill}**.`)] });
    }
    if (sub === 'removeskill') {
      const skill = interaction.options.getString('skill');
      char.proficiencies.skills = char.proficiencies.skills.filter(s=>s!==skill);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${skill}** proficiency removed.`)] });
    }
    if (sub === 'expertise') {
      const skill = interaction.options.getString('skill');
      if (char.expertises.includes(skill)) {
        char.expertises = char.expertises.filter(s=>s!==skill);
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[successEmbed(`Expertise in **${skill}** removed.`)] });
      } else {
        if (!char.proficiencies.skills.includes(skill)) char.proficiencies.skills.push(skill);
        char.expertises.push(skill);
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[successEmbed(`**${char.name}** now has ◆ expertise in **${skill}**.`)] });
      }
    }
    if (sub === 'addsave') {
      const ab = interaction.options.getString('ability');
      if (!char.proficiencies.saves.includes(ab)) char.proficiencies.saves.push(ab);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${char.name}** gained proficiency in **${ABBR[ab]}** saves.`)] });
    }
    if (sub === 'removesave') {
      const ab = interaction.options.getString('ability');
      char.proficiencies.saves = char.proficiencies.saves.filter(a=>a!==ab);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${ABBR[ab]}** save proficiency removed.`)] });
    }
  }

  // ── FEATURES ────────────────────────────────────────────────────
  if (cmd === 'features') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    if (!char.features) char.features = [];

    if (sub === 'add') {
      const modal = new ModalBuilder()
        .setCustomId(`feature_add_${campName}_${char.userId}`)
        .setTitle('Add Feature')
        .addComponents(
          new ActionRowBuilder().addComponents(textInput('fname','Feature Name','Second Wind')),
          new ActionRowBuilder().addComponents(textInput('fdesc','Description','Short rest: regain 1d10+fighter level HP.',TextInputStyle.Paragraph,false)),
        );
      return interaction.showModal(modal);
    }
    if (sub === 'remove') {
      const name = interaction.options.getString('name');
      char.features = char.features.filter(f=>f.name.toLowerCase()!==name.toLowerCase());
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`Feature **${name}** removed.`)] });
    }
    if (sub === 'list') {
      if (!char.features.length)
        return interaction.reply({ embeds:[errorEmbed(`${char.name} has no features yet.`)], ephemeral:true });
      const embed = new EmbedBuilder().setColor(CLR.main).setTitle(`⚙️  ${char.name}'s Features`)
        .setDescription(char.features.map(f=>`**${f.name}**${f.desc?`\n*${f.desc}*`:''}`).join('\n\n'));
      return interaction.reply({ embeds:[embed] });
    }
  }

  // ── XP ──────────────────────────────────────────────────────────
  if (cmd === 'xp') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;

    if (sub === 'award') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const amount  = interaction.options.getInteger('amount');
      const target  = interaction.options.getUser('player');
      const targets = target
        ? [data.characters?.[target.id]].filter(Boolean)
        : Object.values(data.characters || {});
      if (!targets.length) return interaction.reply({ embeds:[errorEmbed('No characters to award XP to.')], ephemeral:true });
      for (const c of targets) c.xp = (c.xp||0) + amount;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.star}  XP Awarded`)
          .setDescription(`**+${amount.toLocaleString()} XP** → ${targets.map(c=>c.name).join(', ')}`),
      ]});
    }
    if (sub === 'set') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const amount = interaction.options.getInteger('amount');
      const target = interaction.options.getUser('player');
      const { char } = getChar(interaction, data, target);
      if (!char) return noChar(interaction);
      char.xp = amount;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`${char.name}'s XP set to **${amount.toLocaleString()}**.`)] });
    }
    if (sub === 'view') {
      const target = interaction.options.getUser('player');
      const { char } = getChar(interaction, data, target);
      if (!char) return noChar(interaction);
      const xp     = char.xp || 0;
      const level  = char.level || 1;
      const curXP  = XP_TABLE[Math.min(level-1,19)] || 0;
      const nextXP = XP_TABLE[Math.min(level,19)]   || XP_TABLE[19];
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.blue).setTitle(`📊  ${char.name}  —  XP`)
          .addFields(
            { name:'Level',     value:`**${level}**`, inline:true },
            { name:'Total XP',  value:`**${xp.toLocaleString()}**`, inline:true },
            { name:'Next Level', value:`**${nextXP.toLocaleString()} XP**`, inline:true },
            { name:'Progress',  value:xpBar(xp, level), inline:false },
          ),
      ]});
    }
  }

  // ── LEVEL UP ────────────────────────────────────────────────────
  if (cmd === 'levelup') {
    if (!isDM(interaction.member)) return noDM(interaction);
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    if ((char.level||1) >= 20)
      return interaction.reply({ embeds:[errorEmbed('Already at max level 20.')], ephemeral:true });
    const hpGain = interaction.options.getInteger('hpgain');
    char.level = (char.level||1) + 1;
    char.hp.max    += hpGain;
    char.hp.current = Math.min(char.hp.current + hpGain, char.hp.max);
    char.hitDice.total++;
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[
      new EmbedBuilder().setColor(CLR.yellow).setTitle(`${EMOJI.party}  Level Up!`)
        .setDescription(`**${char.name}** is now **Level ${char.level}**!`)
        .addFields(
          { name:'❤️ HP Gained',    value:`+${hpGain}  (now **${char.hp.max}** max)`, inline:true },
          { name:'✨ Prof Bonus',   value:`**${modStr(pb(char.level))}**`, inline:true },
          { name:'🎲 Hit Dice',     value:`${char.hitDice.total}d${char.hitDice.type}`, inline:true },
        ),
    ]});
  }

  // ── REST ────────────────────────────────────────────────────────
  if (cmd === 'rest') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target  = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const type    = interaction.options.getString('type');
    const targets = target
      ? [data.characters?.[target.id]].filter(Boolean)
      : [data.characters?.[interaction.user.id]].filter(Boolean);
    if (!targets.length) return noChar(interaction);
    const lines = [];
    for (const char of targets) {
      if (type === 'long') {
        char.hp.current = char.hp.max; char.hp.temp = 0;
        char.hitDice.used = Math.max(0, char.hitDice.used - Math.floor(char.hitDice.total/2));
        if (char.spells?.slots) for (const k of Object.keys(char.spells.slots)) char.spells.slots[k].used=0;
        char.deathSaves = { successes:0, failures:0 };
        lines.push(`${EMOJI.moon} **${char.name}** — long rest complete. Full HP & spell slots restored.`);
      } else {
        const avail = char.hitDice.total - char.hitDice.used;
        if (avail > 0) {
          char.hitDice.used++;
          const conMod = abilMod(char.abilities.constitution||10);
          const roll   = executeRoll(`1d${char.hitDice.type}${conMod>=0?`+${conMod}`:conMod}`, 'normal');
          char.hp.current = Math.min(char.hp.current + roll.sum, char.hp.max);
          lines.push(`${EMOJI.sun} **${char.name}** — short rest. Spent 1d${char.hitDice.type}: +**${roll.sum}** HP (now ${char.hp.current}/${char.hp.max})`);
        } else {
          lines.push(`${EMOJI.sun} **${char.name}** — short rest but no hit dice remaining.`);
        }
      }
    }
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[
      new EmbedBuilder().setColor(type==='long'?CLR.purple:CLR.blue)
        .setTitle(type==='long'?`${EMOJI.moon}  Long Rest`:`${EMOJI.sun}  Short Rest`)
        .setDescription(lines.join('\n')),
    ]});
  }

  // ── INSPIRATION ─────────────────────────────────────────────────
  if (cmd === 'inspiration') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    if (sub === 'give') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const target = interaction.options.getUser('player');
      const { char } = getChar(interaction, data, target);
      if (!char) return noChar(interaction);
      char.inspiration = true;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.yellow).setTitle(`${EMOJI.magic}  Inspiration Granted`)
          .setDescription(`**${char.name}** has been blessed with Inspiration!`),
      ]});
    }
    if (sub === 'use') {
      const { char } = getChar(interaction, data);
      if (!char) return noChar(interaction);
      if (!char.inspiration)
        return interaction.reply({ embeds:[errorEmbed('You have no inspiration.')], ephemeral:true });
      char.inspiration = false;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${char.name}** used their Inspiration.`)] });
    }
    if (sub === 'status') {
      const target = interaction.options.getUser('player');
      const { char } = getChar(interaction, data, target);
      if (!char) return noChar(interaction);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(char.inspiration?CLR.yellow:CLR.grey)
          .setTitle(`${EMOJI.magic}  ${char.name}  —  Inspiration`)
          .setDescription(char.inspiration ? '✨ **Has inspiration**' : '○ No inspiration'),
      ], ephemeral:true });
    }
  }

  // ── NOTES ───────────────────────────────────────────────────────
  if (cmd === 'notes') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    if (sub === 'set') {
      const { char } = getChar(interaction, data);
      if (!char) return noChar(interaction);
      const modal = new ModalBuilder()
        .setCustomId(`notes_set_${campName}`)
        .setTitle(`Notes — ${char.name}`)
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph)
            .setValue(char.notes||'').setRequired(false).setPlaceholder('Write anything…'),
        ));
      return interaction.showModal(modal);
    }
    if (sub === 'view') {
      const target = interaction.options.getUser('player');
      const { char } = getChar(interaction, data, target);
      if (!char) return noChar(interaction);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.main).setTitle(`${EMOJI.note}  ${char.name}'s Notes`)
          .setDescription(char.notes?.slice(0,4000)||'*No notes yet.*'),
      ], ephemeral:true });
    }
  }

  // ── TRAITS ──────────────────────────────────────────────────────
  if (cmd === 'traits') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const target = interaction.options.getUser('player');
    if (target && !isDM(interaction.member)) return noDM(interaction);
    const { char } = getChar(interaction, data, target);
    if (!char) return noChar(interaction);
    const t = char.traits || {};
    const modal = new ModalBuilder()
      .setCustomId(`traits_set_${campName}_${char.userId}`)
      .setTitle(`Traits — ${char.name}`)
      .addComponents(
        new ActionRowBuilder().addComponents(textInput('personality','Personality','I quote ancient texts.',TextInputStyle.Paragraph,false,t.personality||'')),
        new ActionRowBuilder().addComponents(textInput('ideals','Ideals','Power comes with responsibility.',TextInputStyle.Paragraph,false,t.ideals||'')),
        new ActionRowBuilder().addComponents(textInput('bonds','Bonds','I must protect my village.',TextInputStyle.Paragraph,false,t.bonds||'')),
        new ActionRowBuilder().addComponents(textInput('flaws','Flaws','I speak without thinking.',TextInputStyle.Paragraph,false,t.flaws||'')),
      );
    return interaction.showModal(modal);
  }

  // ── PARTY ───────────────────────────────────────────────────────
  if (cmd === 'party') {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const chars = Object.values(res.data.characters || {});
    if (!chars.length)
      return interaction.reply({ embeds:[errorEmbed('No characters in this campaign.')], ephemeral:true });
    return interaction.reply({ embeds:[partyEmbed(res.name, chars)] });
  }

  // ── LOOT ────────────────────────────────────────────────────────
  if (cmd === 'loot') {
    if (!isDM(interaction.member)) return noDM(interaction);
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    const { name: campName, data } = res;
    const chars = Object.values(data.characters || {});
    if (!chars.length) return interaction.reply({ embeds:[errorEmbed('No characters to distribute to.')], ephemeral:true });
    const itemStr = interaction.options.getString('items');
    const items   = itemStr.toLowerCase() === 'none' ? [] : itemStr.split(',').map(s=>s.trim()).filter(Boolean);
    const lootGP  = interaction.options.getInteger('gp') || 0;
    const lootSP  = interaction.options.getInteger('sp') || 0;
    const lootCP  = interaction.options.getInteger('cp') || 0;
    const lootPP  = interaction.options.getInteger('pp') || 0;
    const share   = {
      gp: Math.floor(lootGP / chars.length),
      sp: Math.floor(lootSP / chars.length),
      cp: Math.floor(lootCP / chars.length),
      pp: Math.floor(lootPP / chars.length),
    };
    const remainder = {
      gp: lootGP % chars.length,
      sp: lootSP % chars.length,
      cp: lootCP % chars.length,
      pp: lootPP % chars.length,
    };
    for (const c of chars) {
      if (!c.currency) c.currency = {cp:0,sp:0,ep:0,gp:0,pp:0};
      for (const coin of ['gp','sp','cp','pp']) c.currency[coin] += share[coin];
    }
    saveCampaign(interaction.guildId, campName, data);
    const coinTotal = [lootPP&&`${lootPP}pp`, lootGP&&`${lootGP}gp`, lootSP&&`${lootSP}sp`, lootCP&&`${lootCP}cp`].filter(Boolean).join(' · ');
    const coinShare = [share.pp&&`${share.pp}pp`, share.gp&&`${share.gp}gp`, share.sp&&`${share.sp}sp`, share.cp&&`${share.cp}cp`].filter(Boolean).join(' · ');
    const remStr    = [remainder.pp&&`${remainder.pp}pp`, remainder.gp&&`${remainder.gp}gp`, remainder.sp&&`${remainder.sp}sp`, remainder.cp&&`${remainder.cp}cp`].filter(Boolean).join(' · ');
    return interaction.reply({ embeds:[
      new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.gold}  Loot Distributed`)
        .addFields(
          { name:'💎 Items',       value: items.length ? items.join(', ') : '*None*', inline:false },
          { name:'💰 Total Coin',  value: coinTotal || '*None*', inline:true },
          { name:'👤 Each Gets',   value: coinShare || '*Nothing*', inline:true },
          { name:'🪙 Remainder',   value: remStr    || '*None*', inline:true },
          { name:'📝 Note', value:'Items not auto-assigned — use `/inventory add` to distribute them.', inline:false },
        ),
    ]});
  }

  // ── DM TOOLS ────────────────────────────────────────────────────
  if (cmd === 'dm') {
    if (!isDM(interaction.member)) return noDM(interaction);

    if (sub === 'roll') {
      const expr   = interaction.options.getString('expression');
      const mode   = interaction.options.getString('mode') || 'normal';
      const label  = interaction.options.getString('label') || expr;
      const result = executeRoll(expr, mode);
      if (!result) return interaction.reply({ embeds:[errorEmbed(`Invalid: \`${expr}\``)], ephemeral:true });
      return interaction.reply({ embeds:[rollEmbed(`${EMOJI.lock} ${label}`, expr, result, mode)], ephemeral:true });
    }

    if (sub === 'npc') {
      const name  = interaction.options.getString('name');
      const crRaw = interaction.options.getString('cr');
      const type  = interaction.options.getString('type') || 'humanoid';
      let crNum;
      try { crNum = eval(crRaw) || 1; } catch { crNum = 1; }
      const hp      = Math.max(4, Math.floor(crNum * 15 + 10));
      const ac      = Math.min(20, Math.floor(crNum * 0.7 + 12));
      const atk     = Math.floor(crNum * 0.5 + 2);
      const saveDC  = Math.floor(crNum * 0.5 + 10);
      const scores  = ABILITIES.map(() => {
        const rolls = [d(6),d(6),d(6),d(6)].sort((a,b)=>b-a).slice(0,3);
        return rolls.reduce((a,b)=>a+b,0);
      });
      const abilLine = ABILITIES.map((a,i)=>`\`${ABBR[a]}\` **${scores[i]}** (${modStr(abilMod(scores[i]))})`).join('  ');
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.grey).setTitle(`👤  ${name}  —  CR ${crRaw} ${type}`)
          .addFields(
            { name:`${EMOJI.heart} HP`,    value:`~${hp}`, inline:true },
            { name:`${EMOJI.shield} AC`,   value:`${ac}`, inline:true },
            { name:'⚔️ Atk Bonus',        value:`+${atk}`, inline:true },
            { name:'🎯 Save DC',           value:`${saveDC}`, inline:true },
            { name:'📊 Ability Scores',    value:abilLine, inline:false },
          ).setFooter({ text:'Quick generated — adjust as needed.' }),
      ], ephemeral:true });
    }

    if (sub === 'xpbudget') {
      const players = interaction.options.getInteger('players');
      const level   = interaction.options.getInteger('level');
      const thresh  = ENC_XP[level] || ENC_XP[1];
      const [e,m,h,deadly] = thresh.map(t=>t*players);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.red).setTitle(`⚔️  Encounter Budget — ${players} players, level ${level}`)
          .addFields(
            { name:'🟢 Easy',    value:`${e.toLocaleString()} XP`,      inline:true },
            { name:'🟡 Medium',  value:`${m.toLocaleString()} XP`,      inline:true },
            { name:'🔴 Hard',    value:`${h.toLocaleString()} XP`,      inline:true },
            { name:'💀 Deadly',  value:`${deadly.toLocaleString()} XP`, inline:true },
          ),
      ], ephemeral:true });
    }

    if (sub === 'grouproll') {
      const name  = interaction.options.getString('name');
      const count = interaction.options.getInteger('count');
      const mod   = interaction.options.getInteger('modifier') || 0;
      const rolls = Array.from({ length:count }, (_,i) => {
        const r = executeRoll(`1d20${mod>=0?`+${mod}`:mod}`, 'normal');
        return `${name} **${i+1}** → **${r.sum}** *(${r.final[0]})*`;
      });
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.red).setTitle(`${EMOJI.dice}  Initiative — ${name}s`)
          .setDescription(rolls.join('\n')),
      ], ephemeral:true });
    }

    if (sub === 'setlevel') {
      const res = getActiveCamp(interaction);
      if (!res) return noCamp(interaction);
      const { name: campName, data } = res;
      const target = interaction.options.getUser('player');
      const { char } = getChar(interaction, data, target);
      if (!char) return noChar(interaction);
      const level = interaction.options.getInteger('level');
      char.level = level;
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[successEmbed(`**${char.name}** set to level **${level}**.`)] });
    }
  }

  // ── REFERENCE ───────────────────────────────────────────────────
  if (cmd === 'ref') {
    if (sub === 'condition') {
      const name = interaction.options.getString('name');
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.orange).setTitle(`${EMOJI.book}  Condition: ${name}`)
          .setDescription(CONDITION_DESC[name] || '*No data.*'),
      ], ephemeral:true });
    }
    if (sub === 'action') {
      const name = interaction.options.getString('name');
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.blue).setTitle(`⚡  Action: ${name}`)
          .setDescription(ACTION_DESC[name] || '*No data.*'),
      ], ephemeral:true });
    }
    if (sub === 'xptable') {
      const lines = XP_TABLE.map((xp,i) => `**Lv ${i+1}** — ${xp.toLocaleString()} XP — Prof **${modStr(pb(i+1))}**`);
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.blue).setTitle('📊  XP & Proficiency Bonus Table')
          .setDescription(lines.join('\n')),
      ], ephemeral:true });
    }
    if (sub === 'spellslots') {
      const caster = interaction.options.getString('caster');
      let title, desc;
      if (caster === 'full') {
        title = 'Full Caster — Wizard / Sorcerer / Cleric / Druid / Bard';
        desc  = Object.entries(FULL_SLOTS).map(([lvl,s])=>`**Lv ${lvl}:** ${s.join(' / ')}`).join('\n');
      } else if (caster === 'half') {
        title = 'Half Caster — Paladin / Ranger';
        desc  = 'Slots begin at level 2, roughly half a full caster. Refer to the Player\'s Handbook table for exact values.';
      } else if (caster === 'warlock') {
        title = 'Warlock — Pact Magic';
        const wl = [[1,1,1],[2,2,1],[3,2,2],[4,2,2],[5,3,3],[6,3,3],[7,4,4],[8,4,4],[9,5,5],[10,5,5],[11,5,5],[12,5,5],[13,5,5],[14,5,5],[15,5,5],[16,5,5],[17,4,5],[18,4,5],[19,4,5],[20,4,5]];
        desc  = wl.map(([l,sl,slvl])=>`**Lv ${l}:** ${sl} slot(s) at spell level ${slvl}`).join('\n');
      } else {
        title = 'Third Caster — Eldritch Knight / Arcane Trickster';
        desc  = 'Slots unlock at level 3, at roughly 1/3 the rate of a full caster. See the Player\'s Handbook for the complete table.';
      }
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.purple).setTitle(`${EMOJI.magic}  ${title}`).setDescription(desc),
      ], ephemeral:true });
    }
    if (sub === 'abilities') {
      return interaction.reply({ embeds:[
        new EmbedBuilder().setColor(CLR.blue).setTitle(`${EMOJI.book}  Ability Score Reference`)
          .addFields(
            { name:'💪 Strength',     value:'Melee attacks, Athletics, carrying capacity', inline:false },
            { name:'🏃 Dexterity',    value:'Ranged attacks, AC (light/no armor), Stealth, Acrobatics, Sleight of Hand, initiative', inline:false },
            { name:'❤️ Constitution', value:'HP, concentration checks', inline:false },
            { name:'🧠 Intelligence', value:'Arcana, History, Investigation, Nature, Religion, Wizard spellcasting', inline:false },
            { name:'🦉 Wisdom',       value:'Insight, Medicine, Perception, Survival, Animal Handling, Cleric/Druid spellcasting', inline:false },
            { name:'🎭 Charisma',     value:'Deception, Intimidation, Performance, Persuasion, Bard/Paladin/Sorcerer/Warlock spellcasting', inline:false },
          ),
      ], ephemeral:true });
    }
  }

  // ── SCHEDULE ────────────────────────────────────────────────────
  if (cmd === 'schedule') {
    const date  = interaction.options.getString('date');
    const time  = interaction.options.getString('time');
    const title = interaction.options.getString('title') || 'Next Session';
    const notes = interaction.options.getString('notes');
    const res   = getActiveCamp(interaction);
    const campName = res?.name || 'Campaign';
    const embed = new EmbedBuilder()
      .setColor(CLR.purple)
      .setTitle(`${EMOJI.calendar}  ${title}`)
      .setDescription(`**${campName}**`)
      .addFields(
        { name:'📆 Date', value:date, inline:true },
        { name:'🕐 Time', value:time, inline:true },
      )
      .setFooter({ text:`Posted by ${interaction.user.username}` })
      .setTimestamp();
    if (notes) embed.addFields({ name:`${EMOJI.note} Notes`, value:notes });
    return interaction.reply({ embeds:[embed] });
  }

});

// ───────────────────────────────────────────────────────────────
//  MODAL HANDLER
// ───────────────────────────────────────────────────────────────
async function handleModal(interaction) {
  const id = interaction.customId;

  // ── Character Create ──────────────────────────────────────────
  if (id.startsWith('char_create_')) {
    const campName = id.replace('char_create_', '');
    const data = loadCampaign(interaction.guildId, campName);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });

    const name  = interaction.fields.getTextInputValue('charname');
    const race  = interaction.fields.getTextInputValue('race');
    const cls   = interaction.fields.getTextInputValue('class');
    const lvlS  = interaction.fields.getTextInputValue('level');
    const bg    = interaction.fields.getTextInputValue('background');
    const level = Math.max(1, Math.min(20, parseInt(lvlS) || 1));

    if (!data.characters) data.characters = {};
    const char = newCharacter(interaction.user.id, name, race, cls, level);
    if (bg) char.background = bg;
    data.characters[interaction.user.id] = char;
    saveCampaign(interaction.guildId, campName, data);

    return interaction.reply({
      embeds:[charSheetEmbed(char, `${EMOJI.party} Character Created — ${name}`)],
      components:[hpButtons(interaction.user.id)],
    });
  }

  // ── Character Edit ────────────────────────────────────────────
  if (id.startsWith('char_edit_')) {
    const campName = id.replace('char_edit_', '');
    const data = loadCampaign(interaction.guildId, campName);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });
    const char = data.characters?.[interaction.user.id];
    if (!char) return interaction.reply({ embeds:[errorEmbed('No character.')], ephemeral:true });

    char.subclass   = interaction.fields.getTextInputValue('subclass')   || char.subclass;
    char.background = interaction.fields.getTextInputValue('background') || char.background;
    char.alignment  = interaction.fields.getTextInputValue('alignment')  || char.alignment;
    const langs     = interaction.fields.getTextInputValue('languages');
    if (langs) char.proficiencies.languages = langs.split(',').map(s=>s.trim()).filter(Boolean);

    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[charSheetEmbed(char)], components:[hpButtons(char.userId)] });
  }

  // ── Ability Scores ────────────────────────────────────────────
  if (id.startsWith('abilities_')) {
    const parts    = id.split('_');
    const campName = parts[1];
    const userId   = parts[2];
    const data = loadCampaign(interaction.guildId, campName);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });
    const char = data.characters?.[userId];
    if (!char) return interaction.reply({ embeds:[errorEmbed('No character.')], ephemeral:true });

    char.abilities.strength     = Math.min(30, Math.max(1, parseInt(interaction.fields.getTextInputValue('str'))||10));
    char.abilities.dexterity    = Math.min(30, Math.max(1, parseInt(interaction.fields.getTextInputValue('dex'))||10));
    char.abilities.constitution = Math.min(30, Math.max(1, parseInt(interaction.fields.getTextInputValue('con'))||10));
    char.abilities.intelligence = Math.min(30, Math.max(1, parseInt(interaction.fields.getTextInputValue('int'))||10));
    char.abilities.wisdom       = Math.min(30, Math.max(1, parseInt(interaction.fields.getTextInputValue('wis'))||10));
    // CHA not in modal (Discord 5-row limit) — use /abilities again or /character edit
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({
      embeds:[charSheetEmbed(char)],
      components:[hpButtons(userId)],
      content:`> ⚠️ Charisma not shown in form (Discord 5-field limit). Use \`/abilities\` again to set CHA separately — set only the CHA field and leave others unchanged.`,
    });
  }

  // ── Weapon Add ────────────────────────────────────────────────
  if (id.startsWith('weapon_add_')) {
    const campName = id.replace('weapon_add_', '');
    const data = loadCampaign(interaction.guildId, campName);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });
    const char = data.characters?.[interaction.user.id];
    if (!char) return interaction.reply({ embeds:[errorEmbed('No character.')], ephemeral:true });

    const atk = {
      name:   interaction.fields.getTextInputValue('wname'),
      toHit:  interaction.fields.getTextInputValue('tohit'),
      damage: interaction.fields.getTextInputValue('damage'),
      type:   interaction.fields.getTextInputValue('dtype') || '',
    };
    char.attacks = (char.attacks||[]).filter(a=>a.name.toLowerCase()!==atk.name.toLowerCase());
    char.attacks.push(atk);
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[
      new EmbedBuilder().setColor(CLR.blue).setTitle(`${EMOJI.sword}  Attack Added`)
        .setDescription(`**${atk.name}** — ${atk.toHit} to hit · ${atk.damage}${atk.type?` *${atk.type}*`:''}`),
    ]});
  }

  // ── Feature Add ───────────────────────────────────────────────
  if (id.startsWith('feature_add_')) {
    const parts    = id.replace('feature_add_','').split('_');
    const campName = parts.slice(0,-1).join('_');
    const userId   = parts[parts.length-1];
    const data = loadCampaign(interaction.guildId, campName);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });
    const char = data.characters?.[userId];
    if (!char) return interaction.reply({ embeds:[errorEmbed('No character.')], ephemeral:true });

    const fname = interaction.fields.getTextInputValue('fname');
    const fdesc = interaction.fields.getTextInputValue('fdesc') || '';
    if (!char.features) char.features = [];
    char.features = char.features.filter(f=>f.name.toLowerCase()!==fname.toLowerCase());
    char.features.push({ name:fname, desc:fdesc });
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[successEmbed(`Feature **${fname}** added to ${char.name}.`)] });
  }

  // ── Notes Set ─────────────────────────────────────────────────
  if (id.startsWith('notes_set_')) {
    const campName = id.replace('notes_set_','');
    const data = loadCampaign(interaction.guildId, campName);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });
    const char = data.characters?.[interaction.user.id];
    if (!char) return interaction.reply({ embeds:[errorEmbed('No character.')], ephemeral:true });
    char.notes = interaction.fields.getTextInputValue('notes');
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[successEmbed('Notes updated.')], ephemeral:true });
  }

  // ── Traits Set ────────────────────────────────────────────────
  if (id.startsWith('traits_set_')) {
    const parts    = id.replace('traits_set_','').split('_');
    const campName = parts.slice(0,-1).join('_');
    const userId   = parts[parts.length-1];
    const data = loadCampaign(interaction.guildId, campName);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });
    const char = data.characters?.[userId];
    if (!char) return interaction.reply({ embeds:[errorEmbed('No character.')], ephemeral:true });
    if (!char.traits) char.traits = {};
    char.traits.personality = interaction.fields.getTextInputValue('personality');
    char.traits.ideals      = interaction.fields.getTextInputValue('ideals');
    char.traits.bonds       = interaction.fields.getTextInputValue('bonds');
    char.traits.flaws       = interaction.fields.getTextInputValue('flaws');
    saveCampaign(interaction.guildId, campName, data);
    return interaction.reply({ embeds:[successEmbed(`Traits updated for **${char.name}**.`)] });
  }
}

// ───────────────────────────────────────────────────────────────
//  BUTTON HANDLER
// ───────────────────────────────────────────────────────────────
async function handleButton(interaction) {
  const id = interaction.customId;

  // ── HP buttons ────────────────────────────────────────────────
  if (id.startsWith('hp_') || id.startsWith('rest_')) {
    const parts  = id.split('_');
    const action = parts[1];
    const userId = parts.slice(2).join('_');
    // only the character owner or a DM can press these
    if (interaction.user.id !== userId && !isDM(interaction.member))
      return interaction.reply({ embeds:[errorEmbed('Only the character owner or DM can do this.')], ephemeral:true });

    const camp = getActive(interaction.guildId);
    if (!camp) return interaction.reply({ embeds:[errorEmbed('No active campaign.')], ephemeral:true });
    const data = loadCampaign(interaction.guildId, camp);
    if (!data) return interaction.reply({ embeds:[errorEmbed('Campaign not found.')], ephemeral:true });
    const char = data.characters?.[userId];
    if (!char) return interaction.reply({ embeds:[errorEmbed('Character not found.')], ephemeral:true });

    if (action === 'heal' || action === 'dmg' || action === 'temp') {
      // ask for amount via modal
      const label = action === 'heal' ? 'Heal' : action === 'dmg' ? 'Damage' : 'Temp HP';
      const modal = new ModalBuilder()
        .setCustomId(`hpmodal_${action}_${camp}_${userId}`)
        .setTitle(`${label} — ${char.name}`)
        .addComponents(new ActionRowBuilder().addComponents(
          textInput('amount', `Amount of ${label}`, 'Enter a number…')
        ));
      return interaction.showModal(modal);
    }

    if (id.startsWith('rest_')) {
      const type = action; // 'short' or 'long'
      if (type === 'long') {
        char.hp.current = char.hp.max; char.hp.temp = 0;
        char.hitDice.used = Math.max(0, char.hitDice.used - Math.floor(char.hitDice.total/2));
        if (char.spells?.slots) for (const k of Object.keys(char.spells.slots)) char.spells.slots[k].used=0;
        char.deathSaves = { successes:0, failures:0 };
      } else {
        const avail = char.hitDice.total - char.hitDice.used;
        if (avail > 0) {
          char.hitDice.used++;
          const conMod = abilMod(char.abilities.constitution||10);
          const roll   = executeRoll(`1d${char.hitDice.type}${conMod>=0?`+${conMod}`:conMod}`, 'normal');
          char.hp.current = Math.min(char.hp.current + roll.sum, char.hp.max);
        }
      }
      const campData = data;
      campData.characters[userId] = char;
      saveCampaign(interaction.guildId, camp, campData);
      return interaction.reply({ embeds:[hpEmbed(char)], components:[hpButtons(userId)], ephemeral:true });
    }
  }

  // ── HP modal results ──────────────────────────────────────────
  // (handled in modal handler below as hpmodal_)

  // ── Death save buttons ────────────────────────────────────────
  if (id.startsWith('ds_')) {
    const parts  = id.split('_');
    const mode   = parts[1];
    const userId = parts.slice(2).join('_');
    if (interaction.user.id !== userId && !isDM(interaction.member))
      return interaction.reply({ embeds:[errorEmbed('Only the character owner or DM can do this.')], ephemeral:true });
    const camp = getActive(interaction.guildId);
    if (!camp) return interaction.reply({ embeds:[errorEmbed('No active campaign.')], ephemeral:true });
    const data = loadCampaign(interaction.guildId, camp);
    const char = data?.characters?.[userId];
    if (!char) return interaction.reply({ embeds:[errorEmbed('Character not found.')], ephemeral:true });
    const embed = await doDeathSave(interaction, char, mode, camp, interaction.guildId);
    data.characters[userId] = char;
    saveCampaign(interaction.guildId, camp, data);
    return interaction.reply({ embeds:[embed], components:[deathSaveButtons(userId)] });
  }

  // ── Initiative buttons ────────────────────────────────────────
  if (id === 'init_next') {
    if (!isDM(interaction.member))
      return interaction.reply({ embeds:[errorEmbed('Only DMs can advance turns.')], ephemeral:true });
    const camp = getActive(interaction.guildId);
    if (!camp) return interaction.reply({ embeds:[errorEmbed('No active campaign.')], ephemeral:true });
    const data = loadCampaign(interaction.guildId, camp);
    if (!data?.initiative?.length) return interaction.reply({ embeds:[errorEmbed('Tracker is empty.')], ephemeral:true });
    data.initiativeTurn = (data.initiativeTurn + 1) % data.initiative.length;
    if (data.initiativeTurn === 0) data.round = (data.round||1) + 1;
    saveCampaign(interaction.guildId, camp, data);
    const cur = data.initiative[data.initiativeTurn];
    return interaction.reply({ embeds:[
      new EmbedBuilder().setColor(CLR.red).setTitle(`${EMOJI.sword}  ${cur.name}'s Turn`)
        .setDescription(`Round **${data.round}**`),
      initiativeEmbed(camp, data),
    ], components:[initiativeButtons()] });
  }

  if (id === 'init_show') {
    const camp = getActive(interaction.guildId);
    if (!camp) return interaction.reply({ embeds:[errorEmbed('No active campaign.')], ephemeral:true });
    const data = loadCampaign(interaction.guildId, camp);
    return interaction.reply({ embeds:[initiativeEmbed(camp, data)], components:[initiativeButtons()], ephemeral:true });
  }

  if (id === 'init_clear') {
    if (!isDM(interaction.member))
      return interaction.reply({ embeds:[errorEmbed('Only DMs can end combat.')], ephemeral:true });
    const camp = getActive(interaction.guildId);
    if (!camp) return interaction.reply({ embeds:[errorEmbed('No active campaign.')], ephemeral:true });
    const data = loadCampaign(interaction.guildId, camp);
    data.initiative = []; data.initiativeTurn = 0; data.round = 1;
    saveCampaign(interaction.guildId, camp, data);
    return interaction.reply({ embeds:[successEmbed('Combat ended. Initiative cleared.')] });
  }
}

// extend modal handler to handle hpmodal
const _origHandleModal = handleModal;
async function handleModalExtended(interaction) {
  const id = interaction.customId;
  if (id.startsWith('hpmodal_')) {
    const parts   = id.split('_');
    const action  = parts[1];
    const camp    = parts[2];
    const userId  = parts.slice(3).join('_');
    const data    = loadCampaign(interaction.guildId, camp);
    const char    = data?.characters?.[userId];
    if (!char) return interaction.reply({ embeds:[errorEmbed('Character not found.')], ephemeral:true });
    const amount  = parseInt(interaction.fields.getTextInputValue('amount')) || 0;
    const sub     = action === 'heal' ? 'heal' : action === 'dmg' ? 'damage' : 'temp';
    applyHPChange(char, sub, amount);
    data.characters[userId] = char;
    saveCampaign(interaction.guildId, camp, data);
    return interaction.reply({ embeds:[hpEmbed(char)], components:[hpButtons(userId)] });
  }
  return _origHandleModal(interaction);
}

// replace modal handler
client.off('interactionCreate', client.listeners('interactionCreate')[0]);
client.on('interactionCreate', async interaction => {
  if (interaction.type === InteractionType.ModalSubmit) { await handleModalExtended(interaction); return; }
  if (interaction.isButton()) { await handleButton(interaction); return; }
  if (!interaction.isChatInputCommand()) return;
  // re-trigger main handler — we need to re-attach it
  // (see note below — we restructure this with a single listener)
});

// ── Re-attach properly ──────────────────────────────────────────
// Remove the above stub and the original listener, use one clean listener
client.removeAllListeners('interactionCreate');

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.type === InteractionType.ModalSubmit) { await handleModalExtended(interaction); return; }
    if (interaction.isButton())          { await handleButton(interaction);  return; }
    if (!interaction.isChatInputCommand()) return;

    // ── inline re-dispatch to named command blocks ──────────────
    // The full command logic is defined above as one giant switch.
    // Rather than duplicating it, we emit a synthetic event.
    // Since we can't do that cleanly, the entire handler is
    // consolidated into a single function called here:
    await handleSlashCommand(interaction);
  } catch (e) {
    console.error('[interaction]', e);
    const errMsg = { embeds:[errorEmbed('Something went wrong. Check the console.')], ephemeral:true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg).catch(()=>{});
    else await interaction.reply(errMsg).catch(()=>{});
  }
});

// ───────────────────────────────────────────────────────────────
//  SLASH COMMAND DISPATCH FUNCTION
//  (All the slash command logic is placed here, called from the
//   single interactionCreate listener above.)
// ───────────────────────────────────────────────────────────────
async function handleSlashCommand(interaction) {
  const cmd = interaction.commandName;
  const sub = interaction.options.getSubcommand?.(false);

  // helper shorthands
  const optStr  = k => interaction.options.getString(k);
  const optInt  = k => interaction.options.getInteger(k);
  const optUser = k => interaction.options.getUser(k);
  const target  = () => optUser('player');

  async function withCamp(fn) {
    const res = getActiveCamp(interaction);
    if (!res) return noCamp(interaction);
    return fn(res.name, res.data);
  }
  async function withChar(campName, data, userId, fn) {
    const char = data.characters?.[userId];
    if (!char) return noChar(interaction);
    return fn(char);
  }

  // ── CAMPAIGN ──────────────────────────────────────────────────
  if (cmd === 'campaign') {
    if (sub === 'create') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const name = optStr('name');
      if (fs.existsSync(campaignPath(interaction.guildId, name)))
        return interaction.reply({ embeds:[errorEmbed(`Campaign **${name}** already exists.`)], ephemeral:true });
      const data = { name, createdAt:new Date().toISOString(), dmId:interaction.user.id, characters:{}, initiative:[], initiativeTurn:0, round:1 };
      saveCampaign(interaction.guildId, name, data);
      setActive(interaction.guildId, name);
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.crown}  Campaign Created`).setDescription(`**${name}** is ready.\nDM: <@${interaction.user.id}>`).setFooter({text:'Set as active campaign.'})] });
    }
    if (sub === 'select') {
      const name = optStr('name');
      if (!loadCampaign(interaction.guildId, name)) return interaction.reply({ embeds:[errorEmbed(`No campaign named **${name}**.`)], ephemeral:true });
      setActive(interaction.guildId, name);
      return interaction.reply({ embeds:[successEmbed(`Switched to **${name}**.`)] });
    }
    if (sub === 'list') {
      const list = listCampaigns(interaction.guildId);
      const active = getActive(interaction.guildId);
      if (!list.length) return interaction.reply({ embeds:[errorEmbed('No campaigns yet.')], ephemeral:true });
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.book}  Campaigns`).setDescription(list.map(c=>`${c===active?'▶️':'　'} **${c}**`).join('\n'))] });
    }
    if (sub === 'info') {
      return withCamp(async (n, data) => {
        const chars = Object.values(data.characters||{});
        return interaction.reply({ embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.book}  ${n}`)
          .addFields(
            {name:`${EMOJI.crown} DM`,value:`<@${data.dmId}>`,inline:true},
            {name:'Characters',value:`${chars.length}`,inline:true},
            {name:'Round',value:`${data.round||1}`,inline:true},
            {name:'Party',value:chars.length?chars.map(c=>`**${c.name}** — ${c.race} ${c.class} Lv.${c.level}`).join('\n'):'*None yet.*',inline:false},
          )] });
      });
    }
    if (sub === 'rename') {
      if (!isDM(interaction.member)) return noDM(interaction);
      return withCamp(async (oldName, data) => {
        const newName = optStr('newname');
        const oldP = campaignPath(interaction.guildId, oldName);
        data.name = newName;
        saveCampaign(interaction.guildId, newName, data);
        fs.unlinkSync(oldP);
        setActive(interaction.guildId, newName);
        return interaction.reply({ embeds:[successEmbed(`Campaign renamed to **${newName}**.`)] });
      });
    }
    if (sub === 'delete') {
      if (!isDM(interaction.member)) return noDM(interaction);
      const name = optStr('name');
      const p    = campaignPath(interaction.guildId, name);
      if (!fs.existsSync(p)) return interaction.reply({ embeds:[errorEmbed(`No campaign named **${name}**.`)], ephemeral:true });
      fs.unlinkSync(p);
      gitCommit(`chore: delete campaign "${name}"`);
      if (getActive(interaction.guildId)===name) delete activeMap[interaction.guildId];
      return interaction.reply({ embeds:[successEmbed(`Campaign **${name}** deleted.`)] });
    }
  }

  // ── CHARACTER ─────────────────────────────────────────────────
  if (cmd === 'character') {
    return withCamp(async (campName, data) => {
      if (sub === 'create') {
        if (!isPlayer(interaction.member)) return noPlayer(interaction);
        const modal = new ModalBuilder().setCustomId(`char_create_${campName}`).setTitle('Create Character')
          .addComponents(
            new ActionRowBuilder().addComponents(textInput('charname','Character Name','Aria Moonwhisper')),
            new ActionRowBuilder().addComponents(textInput('race','Race','Elf, Human, Tiefling…')),
            new ActionRowBuilder().addComponents(textInput('class','Class','Fighter, Wizard, Rogue…')),
            new ActionRowBuilder().addComponents(textInput('level','Starting Level','1')),
            new ActionRowBuilder().addComponents(textInput('background','Background (optional)','Soldier, Sage…',TextInputStyle.Short,false)),
          );
        return interaction.showModal(modal);
      }
      if (sub === 'sheet') {
        const t = target();
        if (t && !isDM(interaction.member)) return noDM(interaction);
        const uid = t ? t.id : interaction.user.id;
        const char = data.characters?.[uid];
        if (!char) return noChar(interaction);
        return interaction.reply({ embeds:[charSheetEmbed(char)], components:[hpButtons(uid)] });
      }
      if (sub === 'edit') {
        const char = data.characters?.[interaction.user.id];
        if (!char) return noChar(interaction);
        const t2 = char.traits || {};
        const modal = new ModalBuilder().setCustomId(`char_edit_${campName}`).setTitle(`Edit: ${char.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(textInput('subclass','Subclass','School of Evocation',TextInputStyle.Short,false,char.subclass||'')),
            new ActionRowBuilder().addComponents(textInput('background','Background',char.background||'',TextInputStyle.Short,false,char.background||'')),
            new ActionRowBuilder().addComponents(textInput('alignment','Alignment',char.alignment||'',TextInputStyle.Short,false,char.alignment||'')),
            new ActionRowBuilder().addComponents(textInput('languages','Languages (comma-sep)',char.proficiencies?.languages?.join(', ')||'Common',TextInputStyle.Short,false,char.proficiencies?.languages?.join(', ')||'Common')),
          );
        return interaction.showModal(modal);
      }
      if (sub === 'delete') {
        if (!data.characters?.[interaction.user.id]) return interaction.reply({ embeds:[errorEmbed('No character to delete.')], ephemeral:true });
        delete data.characters[interaction.user.id];
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[successEmbed('Character deleted.')] });
      }
      if (sub === 'list') {
        const chars = Object.values(data.characters||{});
        if (!chars.length) return interaction.reply({ embeds:[errorEmbed('No characters yet.')], ephemeral:true });
        const embed = new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.scroll}  Characters — ${campName}`);
        for (const c of chars) embed.addFields({ name:c.name, value:`${c.race} ${c.class} Lv.${c.level}  ·  HP **${c.hp.current}/${c.hp.max}**  ·  AC **${c.ac}**`, inline:false });
        return interaction.reply({ embeds:[embed] });
      }
    });
  }

  // ── ABILITIES ─────────────────────────────────────────────────
  if (cmd === 'abilities') {
    return withCamp(async (campName, data) => {
      const t   = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      const a = char.abilities;
      const modal = new ModalBuilder().setCustomId(`abilities_${campName}_${uid}`).setTitle(`Ability Scores — ${char.name}`)
        .addComponents(
          new ActionRowBuilder().addComponents(textInput('str','Strength',`${a.strength}`,TextInputStyle.Short,true,`${a.strength}`)),
          new ActionRowBuilder().addComponents(textInput('dex','Dexterity',`${a.dexterity}`,TextInputStyle.Short,true,`${a.dexterity}`)),
          new ActionRowBuilder().addComponents(textInput('con','Constitution',`${a.constitution}`,TextInputStyle.Short,true,`${a.constitution}`)),
          new ActionRowBuilder().addComponents(textInput('int','Intelligence',`${a.intelligence}`,TextInputStyle.Short,true,`${a.intelligence}`)),
          new ActionRowBuilder().addComponents(textInput('wis','Wisdom',`${a.wisdom}`,TextInputStyle.Short,true,`${a.wisdom}`)),
        );
      return interaction.showModal(modal);
    });
  }

  // ── HP ────────────────────────────────────────────────────────
  if (cmd === 'hp') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      const amount = optInt('amount') ?? optInt('value');
      applyHPChange(char, sub, amount);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[hpEmbed(char)], components:[hpButtons(uid)] });
    });
  }

  // ── STATS ─────────────────────────────────────────────────────
  if (cmd === 'stats') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      const val = optInt('value');
      if (sub==='ac')         char.ac        = val;
      if (sub==='speed')      char.speed     = val;
      if (sub==='initiative') char.initiative = val;
      saveCampaign(interaction.guildId, campName, data);
      const label = sub==='ac'?`AC → **${val}**`:sub==='speed'?`Speed → **${val} ft**`:`Initiative mod → **${modStr(val)}**`;
      return interaction.reply({ embeds:[successEmbed(`**${char.name}** — ${label}`)] });
    });
  }

  // ── ROLL ──────────────────────────────────────────────────────
  if (cmd === 'roll') {
    const expr = optStr('expression'), mode = optStr('mode')||'normal', label = optStr('label')||optStr('expression');
    const result = executeRoll(expr, mode);
    if (!result) return interaction.reply({ embeds:[errorEmbed(`Invalid expression: \`${expr}\``)], ephemeral:true });
    return interaction.reply({ embeds:[rollEmbed(label, expr, result, mode)] });
  }

  // ── QUICK DICE ────────────────────────────────────────────────
  const QUICK = {d4:4,d6:6,d8:8,d10:10,d12:12,d20:20,d100:100};
  if (QUICK[cmd]) {
    const sides = QUICK[cmd], count = optInt('count')||1, mod = optInt('modifier')||0, mode = optStr('mode')||'normal';
    const label = optStr('label')||`${count}d${sides}`;
    const expr  = `${count}d${sides}${mod>0?`+${mod}`:mod<0?`${mod}`:''}`;
    const result = executeRoll(expr||`${count}d${sides}`, mode);
    if (!result) return interaction.reply({ embeds:[errorEmbed('Roll failed.')], ephemeral:true });
    return interaction.reply({ embeds:[rollEmbed(label, expr||`${count}d${sides}`, result, mode)] });
  }

  // ── CHECK ─────────────────────────────────────────────────────
  if (cmd === 'check') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      const mode = optStr('mode')||'normal', dc = optInt('dc');
      let bonus, label;
      if (sub === 'skill') {
        const skill = optStr('skill');
        bonus = skillBonus(char, skill);
        label = `${char.name}  —  ${skill.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}`;
      } else {
        const ab = optStr('ability');
        bonus = abilMod(char.abilities[ab]||10);
        label = `${char.name}  —  ${ABBR[ab]} Check`;
      }
      const expr = `1d20${bonus>=0?`+${bonus}`:bonus}`;
      const result = executeRoll(expr, mode);
      const embed  = rollEmbed(label, expr, result, mode);
      if (dc) { const pass=result.sum>=dc; embed.addFields({name:`DC ${dc}`,value:pass?`${EMOJI.check} **Success!**`:`${EMOJI.cross} **Failure**`,inline:true}); embed.setColor(pass?CLR.green:CLR.red); }
      return interaction.reply({ embeds:[embed] });
    });
  }

  // ── SAVE ──────────────────────────────────────────────────────
  if (cmd === 'save') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      const ab = optStr('ability'), mode = optStr('mode')||'normal', dc = optInt('dc');
      const bonus  = saveBonus(char, ab);
      const expr   = `1d20${bonus>=0?`+${bonus}`:bonus}`;
      const result = executeRoll(expr, mode);
      const embed  = rollEmbed(`${char.name}  —  ${ABBR[ab]} Save`, expr, result, mode);
      if (dc) { const pass=result.sum>=dc; embed.addFields({name:`DC ${dc}`,value:pass?`${EMOJI.check} **Success!**`:`${EMOJI.cross} **Failure**`,inline:true}); embed.setColor(pass?CLR.green:CLR.red); }
      return interaction.reply({ embeds:[embed] });
    });
  }

  // ── ATTACK ────────────────────────────────────────────────────
  if (cmd === 'attack') {
    const wname = optStr('weapon'), mode = optStr('mode')||'normal';
    const camp  = getActiveCamp(interaction);
    const saved = camp?.data.characters?.[interaction.user.id]?.attacks?.find(a=>a.name.toLowerCase()===wname.toLowerCase());
    const toHitS  = optStr('tohit') || saved?.toHit || '+0';
    const damExpr = optStr('damage') || saved?.damage;
    const damType = optStr('damagetype') || saved?.type || '';
    const toHitN  = parseInt(toHitS.replace('+',''))||0;
    const atkRes  = executeRoll(`1d20${toHitN>=0?`+${toHitN}`:toHitN}`, mode);
    const damRes  = damExpr ? executeRoll(damExpr, 'normal') : null;
    return interaction.reply({ embeds:[attackEmbed(wname, atkRes, damRes, mode, damType)] });
  }

  // ── WEAPONS ───────────────────────────────────────────────────
  if (cmd === 'weapons') {
    return withCamp(async (campName, data) => {
      const char = data.characters?.[interaction.user.id];
      if (!char) return noChar(interaction);
      if (sub === 'add') {
        const modal = new ModalBuilder().setCustomId(`weapon_add_${campName}`).setTitle('Add Attack')
          .addComponents(
            new ActionRowBuilder().addComponents(textInput('wname','Attack Name','Longsword')),
            new ActionRowBuilder().addComponents(textInput('tohit','To-Hit Bonus','+5')),
            new ActionRowBuilder().addComponents(textInput('damage','Damage','1d8+3')),
            new ActionRowBuilder().addComponents(textInput('dtype','Damage Type','slashing',TextInputStyle.Short,false)),
          );
        return interaction.showModal(modal);
      }
      if (sub === 'remove') {
        const name = optStr('name');
        char.attacks = (char.attacks||[]).filter(a=>a.name.toLowerCase()!==name.toLowerCase());
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[successEmbed(`Attack **${name}** removed.`)] });
      }
      if (sub === 'list') {
        if (!char.attacks?.length) return interaction.reply({ embeds:[errorEmbed('No saved attacks.')], ephemeral:true });
        return interaction.reply({ embeds:[new EmbedBuilder().setColor(CLR.blue).setTitle(`${EMOJI.sword}  ${char.name}'s Attacks`)
          .setDescription(char.attacks.map(a=>`**${a.name}** — ${a.toHit} to hit · ${a.damage}${a.type?` *${a.type}*`:''}`).join('\n'))] });
      }
    });
  }

  // ── DEATH SAVE ────────────────────────────────────────────────
  if (cmd === 'deathsave') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      const mode  = optStr('mode')||'normal';
      const embed = await doDeathSave(interaction, char, mode, campName, interaction.guildId);
      saveCampaign(interaction.guildId, campName, data);
      return interaction.reply({ embeds:[embed], components:[deathSaveButtons(uid)] });
    });
  }

  // ── INITIATIVE ────────────────────────────────────────────────
  if (cmd === 'initiative') {
    return withCamp(async (campName, data) => {
      if (!data.initiative) data.initiative = [];
      if (data.initiativeTurn===undefined) data.initiativeTurn = 0;
      if (!data.round) data.round = 1;

      if (sub === 'roll') {
        if (!isPlayer(interaction.member)) return noPlayer(interaction);
        const char = data.characters?.[interaction.user.id];
        if (!char) return noChar(interaction);
        const mode  = optStr('mode')||'normal';
        const dex   = abilMod(char.abilities.dexterity||10) + (char.initiative||0);
        const expr  = `1d20${dex>=0?`+${dex}`:dex}`;
        const result = executeRoll(expr, mode);
        data.initiative = data.initiative.filter(e=>e.userId!==interaction.user.id);
        data.initiative.push({ name:char.name, userId:interaction.user.id, value:result.sum, roll:result.final[0], hp:char.hp.current });
        data.initiative.sort((a,b)=>b.value-a.value||b.roll-a.roll);
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[
          new EmbedBuilder().setColor(CLR.blue).setTitle(`${EMOJI.dice}  Initiative — ${char.name}`).setDescription(`Rolled **${result.sum}** *(d20: ${result.final[0]}, mod: ${modStr(dex)})*`),
          initiativeEmbed(campName, data),
        ], components:[initiativeButtons()] });
      }
      if (sub === 'add') {
        if (!isDM(interaction.member)) return noDM(interaction);
        const name = optStr('name'), value = optInt('value'), hp = optInt('hp');
        data.initiative.push({ name, value, userId:null, roll:0, hp:hp||null });
        data.initiative.sort((a,b)=>b.value-a.value||b.roll-a.roll);
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
      }
      if (sub === 'show') return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
      if (sub === 'next') {
        if (!isDM(interaction.member)) return noDM(interaction);
        if (!data.initiative.length) return interaction.reply({ embeds:[errorEmbed('Tracker is empty.')], ephemeral:true });
        data.initiativeTurn = (data.initiativeTurn+1)%data.initiative.length;
        if (data.initiativeTurn===0) data.round++;
        saveCampaign(interaction.guildId, campName, data);
        const cur = data.initiative[data.initiativeTurn];
        return interaction.reply({ embeds:[
          new EmbedBuilder().setColor(CLR.red).setTitle(`${EMOJI.sword}  ${cur.name}'s Turn`).setDescription(`Round **${data.round}**`),
          initiativeEmbed(campName, data),
        ], components:[initiativeButtons()] });
      }
      if (sub === 'hp') {
        if (!isDM(interaction.member)) return noDM(interaction);
        const name = optStr('name'), hp = optInt('hp');
        const entry = data.initiative.find(e=>e.name.toLowerCase()===name.toLowerCase());
        if (!entry) return interaction.reply({ embeds:[errorEmbed(`No combatant **${name}**.`)], ephemeral:true });
        entry.hp = hp;
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
      }
      if (sub === 'remove') {
        if (!isDM(interaction.member)) return noDM(interaction);
        data.initiative = data.initiative.filter(e=>e.name.toLowerCase()!==optStr('name').toLowerCase());
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[initiativeEmbed(campName, data)], components:[initiativeButtons()] });
      }
      if (sub === 'clear') {
        if (!isDM(interaction.member)) return noDM(interaction);
        data.initiative=[]; data.initiativeTurn=0; data.round=1;
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[successEmbed('Combat ended.')] });
      }
    });
  }

  // ── CONDITIONS ────────────────────────────────────────────────
  if (cmd === 'condition') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      if (!char.conditions) char.conditions = [];
      if (sub === 'add') {
        const cond = optStr('condition');
        if (!char.conditions.includes(cond)) char.conditions.push(cond);
        saveCampaign(interaction.guildId, campName, data);
        return interaction.reply({ embeds:[new EmbedBuilder().setColor(CLR.orange).setTitle(`${EMOJI.warn}  ${char.name}  —  ${cond}`).setDescription(CONDITION_DESC[cond]||'')] });
      }
      if (sub === 'remove') { char.conditions=char.conditions.filter(c=>c!==optStr('condition')); saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`**${optStr('condition')}** removed.`)]}); }
      if (sub === 'clear')  { char.conditions=[]; saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`All conditions cleared.`)]}); }
      if (sub === 'view')   return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.main).setTitle(`${EMOJI.warn}  ${char.name}  —  Conditions`).setDescription(conditionBadges(char.conditions))]});
    });
  }

  // ── SPELLS ────────────────────────────────────────────────────
  if (cmd === 'spells') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      if (!char.spells) char.spells = { slots:{}, known:[], concentration:null };
      if (sub==='add') {
        const sn=optStr('name'),sl=optInt('level')??0;
        if (!char.spells.known.find(s=>s.name.toLowerCase()===sn.toLowerCase())) char.spells.known.push({name:sn,level:sl});
        saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(`**${sn}** (Lv${sl}) added.`)]});
      }
      if (sub==='remove') {
        const sn=optStr('name'); char.spells.known=char.spells.known.filter(s=>s.name.toLowerCase()!==sn.toLowerCase());
        saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`**${sn}** removed.`)]});
      }
      if (sub==='cast') {
        const lvl=optInt('level'),slot=char.spells.slots[lvl];
        if (!slot||slot.used>=slot.total) return interaction.reply({embeds:[errorEmbed(`No level **${lvl}** slots.`)],ephemeral:true});
        slot.used++; saveCampaign(interaction.guildId,campName,data);
        const dots='◉'.repeat(slot.total-slot.used)+'◎'.repeat(slot.used);
        return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.purple).setTitle(`${EMOJI.magic}  Spell Cast — Level ${lvl}`).setDescription(`**${char.name}** used a slot.\n${dots}  (${slot.total-slot.used}/${slot.total})`)]});
      }
      if (sub==='slots') {
        if (!isDM(interaction.member)) return noDM(interaction);
        const lvl=optInt('level'),total=optInt('total');
        char.spells.slots[lvl]={total,used:char.spells.slots[lvl]?.used||0};
        saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`Level ${lvl} slots → **${total}**.`)]});
      }
      if (sub==='concentration') {
        const spell=optStr('spell')||null; char.spells.concentration=spell;
        saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(spell?`**${char.name}** concentrating on **${spell}**.`:`Concentration ended.`)]});
      }
      if (sub==='list') {
        if (!char.spells.known?.length) return interaction.reply({embeds:[errorEmbed('No known spells.')],ephemeral:true});
        const byLvl={};
        for (const s of char.spells.known) { if (!byLvl[s.level]) byLvl[s.level]=[]; byLvl[s.level].push(s.name); }
        const lines=Object.entries(byLvl).sort(([a],[b])=>+a-+b).map(([l,n])=>`**${+l===0?'Cantrips':`Level ${l}`}:** ${n.join(', ')}`);
        const slots=Object.entries(char.spells.slots||{}).filter(([,v])=>v.total>0).map(([l,v])=>`L${l}: ${'◉'.repeat(v.total-v.used)}${'◎'.repeat(v.used)}`).join('  ');
        const embed=new EmbedBuilder().setColor(CLR.purple).setTitle(`${EMOJI.magic}  ${char.name}'s Spells`).setDescription(lines.join('\n'));
        if (slots) embed.addFields({name:'Slots',value:slots});
        if (char.spells.concentration) embed.addFields({name:'🌀 Concentration',value:`*${char.spells.concentration}*`});
        return interaction.reply({embeds:[embed]});
      }
    });
  }

  // ── INVENTORY ─────────────────────────────────────────────────
  if (cmd === 'inventory') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      if (!char.inventory) char.inventory=[];
      if (sub==='add') {
        const iname=optStr('name'),qty=optInt('quantity')||1,notes=optStr('notes')||'';
        const ex=char.inventory.find(i=>i.name.toLowerCase()===iname.toLowerCase());
        if (ex) ex.qty+=qty; else char.inventory.push({name:iname,qty,notes});
        saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(`Added **${qty}× ${iname}**.`)]});
      }
      if (sub==='remove') {
        const iname=optStr('name'),qty=optInt('quantity')||1;
        const idx=char.inventory.findIndex(i=>i.name.toLowerCase()===iname.toLowerCase());
        if (idx===-1) return interaction.reply({embeds:[errorEmbed(`**${iname}** not found.`)],ephemeral:true});
        char.inventory[idx].qty-=qty;
        if (char.inventory[idx].qty<=0) char.inventory.splice(idx,1);
        saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(`Removed **${qty}× ${iname}**.`)]});
      }
      if (sub==='view') {
        if (!char.inventory.length) return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.main).setTitle(`${EMOJI.bag}  ${char.name}'s Inventory`).setDescription('*Empty.*')]});
        return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.bag}  ${char.name}'s Inventory`).setDescription(char.inventory.map(i=>`• **${i.name}** ×${i.qty}${i.notes?` *(${i.notes})*`:''}`).join('\n'))]});
      }
      if (sub==='clear') {
        if (!isDM(interaction.member)) return noDM(interaction);
        char.inventory=[]; saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed('Inventory cleared.')]});
      }
    });
  }

  // ── CURRENCY ──────────────────────────────────────────────────
  if (cmd === 'currency') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      if (!char.currency) char.currency={cp:0,sp:0,ep:0,gp:0,pp:0};
      if (sub==='view') return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.gold}  ${char.name}'s Purse`).setDescription(coinStr(char.currency))]});
      const sign=sub==='add'?1:-1;
      for (const coin of ['cp','sp','ep','gp','pp']) { const a=optInt(coin)||0; char.currency[coin]=Math.max(0,(char.currency[coin]||0)+sign*a); }
      saveCampaign(interaction.guildId,campName,data);
      return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.gold}  ${char.name}'s Purse`).setDescription(coinStr(char.currency))]});
    });
  }

  // ── PROFICIENCY ───────────────────────────────────────────────
  if (cmd === 'proficiency') {
    return withCamp(async (campName, data) => {
      const t = target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      if (!char.proficiencies) char.proficiencies={skills:[],saves:[],armor:[],weapons:[],tools:[],languages:[]};
      if (!char.expertises) char.expertises=[];
      if (sub==='addskill') {
        const skill=optStr('skill'); if (!char.proficiencies.skills.includes(skill)) char.proficiencies.skills.push(skill);
        saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`Proficiency in **${skill}** added.`)]});
      }
      if (sub==='removeskill') {
        const skill=optStr('skill'); char.proficiencies.skills=char.proficiencies.skills.filter(s=>s!==skill);
        saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`**${skill}** proficiency removed.`)]});
      }
      if (sub==='expertise') {
        const skill=optStr('skill');
        if (char.expertises.includes(skill)) { char.expertises=char.expertises.filter(s=>s!==skill); saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`Expertise in **${skill}** removed.`)]}); }
        if (!char.proficiencies.skills.includes(skill)) char.proficiencies.skills.push(skill);
        char.expertises.push(skill); saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(`◆ Expertise in **${skill}** added.`)]});
      }
      if (sub==='addsave') {
        const ab=optStr('ability'); if (!char.proficiencies.saves.includes(ab)) char.proficiencies.saves.push(ab);
        saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`${ABBR[ab]} save proficiency added.`)]});
      }
      if (sub==='removesave') {
        const ab=optStr('ability'); char.proficiencies.saves=char.proficiencies.saves.filter(a=>a!==ab);
        saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`${ABBR[ab]} save proficiency removed.`)]});
      }
    });
  }

  // ── FEATURES ──────────────────────────────────────────────────
  if (cmd === 'features') {
    return withCamp(async (campName, data) => {
      const t = target();
      const uid  = t ? t.id : interaction.user.id;
      const char = data.characters?.[uid];
      if (!char) return noChar(interaction);
      if (!char.features) char.features=[];
      if (sub==='add') {
        const modal=new ModalBuilder().setCustomId(`feature_add_${campName}_${uid}`).setTitle('Add Feature')
          .addComponents(
            new ActionRowBuilder().addComponents(textInput('fname','Feature Name','Second Wind')),
            new ActionRowBuilder().addComponents(textInput('fdesc','Description','Regain hit points on a short rest.',TextInputStyle.Paragraph,false)),
          );
        return interaction.showModal(modal);
      }
      if (sub==='remove') {
        const name=optStr('name'); char.features=char.features.filter(f=>f.name.toLowerCase()!==name.toLowerCase());
        saveCampaign(interaction.guildId,campName,data); return interaction.reply({embeds:[successEmbed(`**${name}** removed.`)]});
      }
      if (sub==='list') {
        if (!char.features.length) return interaction.reply({embeds:[errorEmbed('No features yet.')],ephemeral:true});
        return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.main).setTitle(`⚙️  ${char.name}'s Features`)
          .setDescription(char.features.map(f=>`**${f.name}**${f.desc?`\n*${f.desc}*`:''}`).join('\n\n'))]});
      }
    });
  }

  // ── XP ────────────────────────────────────────────────────────
  if (cmd === 'xp') {
    return withCamp(async (campName, data) => {
      if (sub==='award') {
        if (!isDM(interaction.member)) return noDM(interaction);
        const amount=optInt('amount'), t=target();
        const targets=t?[data.characters?.[t.id]].filter(Boolean):Object.values(data.characters||{});
        if (!targets.length) return interaction.reply({embeds:[errorEmbed('No characters.')],ephemeral:true});
        for (const c of targets) c.xp=(c.xp||0)+amount;
        saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.star}  XP Awarded`).setDescription(`**+${amount.toLocaleString()} XP** → ${targets.map(c=>c.name).join(', ')}`)]});
      }
      if (sub==='set') {
        if (!isDM(interaction.member)) return noDM(interaction);
        const amount=optInt('amount'), t=target();
        const uid=t?t.id:interaction.user.id;
        const char=data.characters?.[uid]; if (!char) return noChar(interaction);
        char.xp=amount; saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(`**${char.name}** XP → **${amount.toLocaleString()}**.`)]});
      }
      if (sub==='view') {
        const t=target(), uid=t?t.id:interaction.user.id;
        const char=data.characters?.[uid]; if (!char) return noChar(interaction);
        const xp=char.xp||0, lvl=char.level||1;
        const curXP=XP_TABLE[Math.min(lvl-1,19)]||0, nextXP=XP_TABLE[Math.min(lvl,19)]||XP_TABLE[19];
        return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.blue).setTitle(`📊  ${char.name}  —  XP`)
          .addFields(
            {name:'Level',value:`**${lvl}**`,inline:true},
            {name:'Total XP',value:`**${xp.toLocaleString()}**`,inline:true},
            {name:'Next Level',value:`**${nextXP.toLocaleString()}**`,inline:true},
            {name:'Progress',value:xpBar(xp,lvl),inline:false},
          )]});
      }
    });
  }

  // ── LEVELUP ───────────────────────────────────────────────────
  if (cmd === 'levelup') {
    if (!isDM(interaction.member)) return noDM(interaction);
    return withCamp(async (campName, data) => {
      const t=target(), uid=t?t.id:interaction.user.id;
      const char=data.characters?.[uid]; if (!char) return noChar(interaction);
      if ((char.level||1)>=20) return interaction.reply({embeds:[errorEmbed('Max level 20.')],ephemeral:true});
      const hpGain=optInt('hpgain');
      char.level=(char.level||1)+1; char.hp.max+=hpGain; char.hp.current=Math.min(char.hp.current+hpGain,char.hp.max); char.hitDice.total++;
      saveCampaign(interaction.guildId,campName,data);
      return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.yellow).setTitle(`${EMOJI.party}  Level Up!`)
        .setDescription(`**${char.name}** is now **Level ${char.level}**!`)
        .addFields(
          {name:'❤️ HP Gained',value:`+${hpGain}  (max now **${char.hp.max}**)`,inline:true},
          {name:'✨ Prof Bonus',value:`**${modStr(pb(char.level))}**`,inline:true},
          {name:'🎲 Hit Dice',value:`${char.hitDice.total}d${char.hitDice.type}`,inline:true},
        )]});
    });
  }

  // ── REST ──────────────────────────────────────────────────────
  if (cmd === 'rest') {
    return withCamp(async (campName, data) => {
      const t=target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const type=optStr('type');
      const targets=t?[data.characters?.[t.id]].filter(Boolean):[data.characters?.[interaction.user.id]].filter(Boolean);
      if (!targets.length) return noChar(interaction);
      const lines=[];
      for (const char of targets) {
        if (type==='long') {
          char.hp.current=char.hp.max; char.hp.temp=0;
          char.hitDice.used=Math.max(0,char.hitDice.used-Math.floor(char.hitDice.total/2));
          if (char.spells?.slots) for (const k of Object.keys(char.spells.slots)) char.spells.slots[k].used=0;
          char.deathSaves={successes:0,failures:0};
          lines.push(`${EMOJI.moon} **${char.name}** — full HP & spell slots restored.`);
        } else {
          const avail=char.hitDice.total-char.hitDice.used;
          if (avail>0) {
            char.hitDice.used++;
            const conMod=abilMod(char.abilities.constitution||10);
            const roll=executeRoll(`1d${char.hitDice.type}${conMod>=0?`+${conMod}`:conMod}`,'normal');
            char.hp.current=Math.min(char.hp.current+roll.sum,char.hp.max);
            lines.push(`${EMOJI.sun} **${char.name}** — +**${roll.sum}** HP (${char.hp.current}/${char.hp.max})`);
          } else lines.push(`${EMOJI.sun} **${char.name}** — no hit dice left.`);
        }
      }
      saveCampaign(interaction.guildId,campName,data);
      return interaction.reply({embeds:[new EmbedBuilder().setColor(type==='long'?CLR.purple:CLR.blue).setTitle(type==='long'?`${EMOJI.moon}  Long Rest`:`${EMOJI.sun}  Short Rest`).setDescription(lines.join('\n'))]});
    });
  }

  // ── INSPIRATION ───────────────────────────────────────────────
  if (cmd === 'inspiration') {
    return withCamp(async (campName, data) => {
      if (sub==='give') {
        if (!isDM(interaction.member)) return noDM(interaction);
        const uid=optUser('player')?.id; const char=data.characters?.[uid]; if (!char) return noChar(interaction);
        char.inspiration=true; saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.yellow).setTitle(`${EMOJI.magic}  Inspiration`).setDescription(`**${char.name}** granted Inspiration!`)]});
      }
      if (sub==='use') {
        const char=data.characters?.[interaction.user.id]; if (!char) return noChar(interaction);
        if (!char.inspiration) return interaction.reply({embeds:[errorEmbed('No inspiration.')],ephemeral:true});
        char.inspiration=false; saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(`**${char.name}** used Inspiration.`)]});
      }
      if (sub==='status') {
        const t=target(), uid=t?t.id:interaction.user.id;
        const char=data.characters?.[uid]; if (!char) return noChar(interaction);
        return interaction.reply({embeds:[new EmbedBuilder().setColor(char.inspiration?CLR.yellow:CLR.grey).setTitle(`${EMOJI.magic}  ${char.name}  —  Inspiration`).setDescription(char.inspiration?'✨ **Has inspiration**':'○ No inspiration')],ephemeral:true});
      }
    });
  }

  // ── NOTES ─────────────────────────────────────────────────────
  if (cmd === 'notes') {
    return withCamp(async (campName, data) => {
      if (sub==='set') {
        const char=data.characters?.[interaction.user.id]; if (!char) return noChar(interaction);
        const modal=new ModalBuilder().setCustomId(`notes_set_${campName}`).setTitle(`Notes — ${char.name}`)
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setValue(char.notes||'').setRequired(false).setPlaceholder('Anything goes…'),
          ));
        return interaction.showModal(modal);
      }
      if (sub==='view') {
        const t=target(), uid=t?t.id:interaction.user.id;
        const char=data.characters?.[uid]; if (!char) return noChar(interaction);
        return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.main).setTitle(`${EMOJI.note}  ${char.name}'s Notes`).setDescription(char.notes?.slice(0,4000)||'*No notes yet.*')],ephemeral:true});
      }
    });
  }

  // ── TRAITS ────────────────────────────────────────────────────
  if (cmd === 'traits') {
    return withCamp(async (campName, data) => {
      const t=target();
      if (t && !isDM(interaction.member)) return noDM(interaction);
      const uid=t?t.id:interaction.user.id;
      const char=data.characters?.[uid]; if (!char) return noChar(interaction);
      const tr=char.traits||{};
      const modal=new ModalBuilder().setCustomId(`traits_set_${campName}_${uid}`).setTitle(`Traits — ${char.name}`)
        .addComponents(
          new ActionRowBuilder().addComponents(textInput('personality','Personality','I talk at length about my deity.',TextInputStyle.Paragraph,false,tr.personality||'')),
          new ActionRowBuilder().addComponents(textInput('ideals','Ideals','Community — we must protect each other.',TextInputStyle.Paragraph,false,tr.ideals||'')),
          new ActionRowBuilder().addComponents(textInput('bonds','Bonds','I will protect my home village.',TextInputStyle.Paragraph,false,tr.bonds||'')),
          new ActionRowBuilder().addComponents(textInput('flaws','Flaws','I have trouble trusting others.',TextInputStyle.Paragraph,false,tr.flaws||'')),
        );
      return interaction.showModal(modal);
    });
  }

  // ── PARTY ─────────────────────────────────────────────────────
  if (cmd === 'party') {
    return withCamp(async (campName, data) => {
      const chars=Object.values(data.characters||{});
      if (!chars.length) return interaction.reply({embeds:[errorEmbed('No characters in this campaign.')],ephemeral:true});
      return interaction.reply({embeds:[partyEmbed(campName, chars)]});
    });
  }

  // ── LOOT ──────────────────────────────────────────────────────
  if (cmd === 'loot') {
    if (!isDM(interaction.member)) return noDM(interaction);
    return withCamp(async (campName, data) => {
      const chars=Object.values(data.characters||{});
      if (!chars.length) return interaction.reply({embeds:[errorEmbed('No characters to give loot to.')],ephemeral:true});
      const itemStr=optStr('items');
      const items=itemStr.toLowerCase()==='none'?[]:itemStr.split(',').map(s=>s.trim()).filter(Boolean);
      const totals={gp:optInt('gp')||0,sp:optInt('sp')||0,cp:optInt('cp')||0,pp:optInt('pp')||0};
      const share={}, rem={};
      for (const c of ['gp','sp','cp','pp']) { share[c]=Math.floor(totals[c]/chars.length); rem[c]=totals[c]%chars.length; }
      for (const char of chars) { if (!char.currency) char.currency={cp:0,sp:0,ep:0,gp:0,pp:0}; for (const c of ['gp','sp','cp','pp']) char.currency[c]+=share[c]; }
      saveCampaign(interaction.guildId,campName,data);
      const fmt=o=>Object.entries(o).filter(([,v])=>v>0).map(([k,v])=>`${v}${k}`).join(' · ')||'—';
      return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.gold).setTitle(`${EMOJI.gold}  Loot`)
        .addFields(
          {name:'💎 Items',value:items.length?items.join(', '):'*None*',inline:false},
          {name:'💰 Total',value:fmt(totals),inline:true},
          {name:'👤 Each',value:fmt(share),inline:true},
          {name:'🪙 Remainder',value:fmt(rem),inline:true},
          {name:'📝 Note',value:'Use `/inventory add` to hand out items.',inline:false},
        )]});
    });
  }

  // ── DM TOOLS ─────────────────────────────────────────────────
  if (cmd === 'dm') {
    if (!isDM(interaction.member)) return noDM(interaction);
    if (sub==='roll') {
      const expr=optStr('expression'),mode=optStr('mode')||'normal',label=optStr('label')||optStr('expression');
      const result=executeRoll(expr,mode);
      if (!result) return interaction.reply({embeds:[errorEmbed(`Invalid: \`${expr}\``)],ephemeral:true});
      return interaction.reply({embeds:[rollEmbed(`${EMOJI.lock} ${label}`,expr,result,mode)],ephemeral:true});
    }
    if (sub==='npc') {
      const name=optStr('name'),crRaw=optStr('cr'),type=optStr('type')||'humanoid';
      let crNum; try { crNum=eval(crRaw)||1; } catch { crNum=1; }
      const hp=Math.max(4,Math.floor(crNum*15+10)),ac=Math.min(20,Math.floor(crNum*0.7+12));
      const atk=Math.floor(crNum*0.5+2),saveDC=Math.floor(crNum*0.5+10);
      const scores=ABILITIES.map(()=>{const r=[d(6),d(6),d(6),d(6)].sort((a,b)=>b-a).slice(0,3);return r.reduce((a,b)=>a+b,0);});
      return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.grey).setTitle(`👤  ${name}  —  CR ${crRaw} ${type}`)
        .addFields(
          {name:`${EMOJI.heart} HP`,value:`~${hp}`,inline:true},
          {name:`${EMOJI.shield} AC`,value:`${ac}`,inline:true},
          {name:'⚔️ Atk Bonus',value:`+${atk}`,inline:true},
          {name:'🎯 Save DC',value:`${saveDC}`,inline:true},
          {name:'📊 Scores',value:ABILITIES.map((a,i)=>`\`${ABBR[a]}\` **${scores[i]}** (${modStr(abilMod(scores[i]))})`).join('  '),inline:false},
        ).setFooter({text:'Quick-generated — adjust as needed.'})],ephemeral:true});
    }
    if (sub==='xpbudget') {
      const players=optInt('players'),level=optInt('level');
      const thresh=ENC_XP[level]||ENC_XP[1];
      const [e,m,h,deadly]=thresh.map(t=>t*players);
      return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.red).setTitle(`⚔️  Encounter Budget — ${players}p Lv${level}`)
        .addFields(
          {name:'🟢 Easy',value:`${e.toLocaleString()} XP`,inline:true},
          {name:'🟡 Medium',value:`${m.toLocaleString()} XP`,inline:true},
          {name:'🔴 Hard',value:`${h.toLocaleString()} XP`,inline:true},
          {name:'💀 Deadly',value:`${deadly.toLocaleString()} XP`,inline:true},
        )],ephemeral:true});
    }
    if (sub==='grouproll') {
      const name=optStr('name'),count=optInt('count'),mod=optInt('modifier')||0;
      const rolls=Array.from({length:count},(_,i)=>{const r=executeRoll(`1d20${mod>=0?`+${mod}`:mod}`,'normal');return `**${name} ${i+1}** → **${r.sum}** *(${r.final[0]})*`;});
      return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.red).setTitle(`${EMOJI.dice}  Group Initiative — ${name}s`).setDescription(rolls.join('\n'))],ephemeral:true});
    }
    if (sub==='setlevel') {
      return withCamp(async (campName, data) => {
        const t=optUser('player'); const uid=t.id;
        const char=data.characters?.[uid]; if (!char) return noChar(interaction);
        char.level=optInt('level'); saveCampaign(interaction.guildId,campName,data);
        return interaction.reply({embeds:[successEmbed(`**${char.name}** set to level **${char.level}**.`)]});
      });
    }
  }

  // ── REFERENCE ─────────────────────────────────────────────────
  if (cmd === 'ref') {
    if (sub==='condition') return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.orange).setTitle(`${EMOJI.book}  ${optStr('name')}`).setDescription(CONDITION_DESC[optStr('name')]||'*No data.*')],ephemeral:true});
    if (sub==='action')    return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.blue).setTitle(`⚡  ${optStr('name')}`).setDescription(ACTION_DESC[optStr('name')]||'*No data.*')],ephemeral:true});
    if (sub==='xptable')   return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.blue).setTitle('📊  XP Table').setDescription(XP_TABLE.map((x,i)=>`**Lv ${i+1}** — ${x.toLocaleString()} XP — Prof **${modStr(pb(i+1))}**`).join('\n'))],ephemeral:true});
    if (sub==='abilities') return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.blue).setTitle(`${EMOJI.book}  Ability Score Reference`)
      .addFields(
        {name:'💪 Strength',value:'Melee attacks · Athletics · carrying capacity',inline:false},
        {name:'🏃 Dexterity',value:'Ranged attacks · AC (light/no armor) · Stealth · Acrobatics · Sleight of Hand · initiative',inline:false},
        {name:'❤️ Constitution',value:'HP · concentration saves',inline:false},
        {name:'🧠 Intelligence',value:'Arcana · History · Investigation · Nature · Religion · Wizard spells',inline:false},
        {name:'🦉 Wisdom',value:'Insight · Medicine · Perception · Survival · Animal Handling · Cleric/Druid spells',inline:false},
        {name:'🎭 Charisma',value:'Deception · Intimidation · Performance · Persuasion · Bard/Paladin/Sorcerer/Warlock spells',inline:false},
      )],ephemeral:true});
    if (sub==='spellslots') {
      const caster=optStr('caster');
      let title,desc;
      if (caster==='full') { title='Full Caster — Wizard/Sorcerer/Cleric/Druid/Bard'; desc=Object.entries(FULL_SLOTS).map(([l,s])=>`**Lv ${l}:** ${s.join(' / ')}`).join('\n'); }
      else if (caster==='half') { title='Half Caster — Paladin/Ranger'; desc='Slots start at level 2 at half the full-caster rate.'; }
      else if (caster==='warlock') { title='Warlock — Pact Magic'; const wl=[[1,1,1],[2,2,1],[3,2,2],[4,2,2],[5,3,3],[6,3,3],[7,4,4],[8,4,4],[9,5,5],[10,5,5],[11,5,5],[12,5,5],[13,5,5],[14,5,5],[15,5,5],[16,5,5],[17,4,5],[18,4,5],[19,4,5],[20,4,5]]; desc=wl.map(([l,sl,slvl])=>`**Lv ${l}:** ${sl} slot(s) at level ${slvl}`).join('\n'); }
      else { title='Third Caster — Eldritch Knight / Arcane Trickster'; desc='Slots unlock at level 3 at 1/3 the rate.'; }
      return interaction.reply({embeds:[new EmbedBuilder().setColor(CLR.purple).setTitle(`${EMOJI.magic}  ${title}`).setDescription(desc)],ephemeral:true});
    }
  }

  // ── SCHEDULE ──────────────────────────────────────────────────
  if (cmd === 'schedule') {
    const date=optStr('date'),time=optStr('time'),title=optStr('title')||'Next Session',notes=optStr('notes');
    const res=getActiveCamp(interaction);
    const embed=new EmbedBuilder().setColor(CLR.purple).setTitle(`${EMOJI.calendar}  ${title}`).setDescription(`**${res?.name||'Campaign'}**`)
      .addFields({name:'📆 Date',value:date,inline:true},{name:'🕐 Time',value:time,inline:true})
      .setFooter({text:`Posted by ${interaction.user.username}`}).setTimestamp();
    if (notes) embed.addFields({name:`${EMOJI.note} Notes`,value:notes});
    return interaction.reply({embeds:[embed]});
  }
}

// ───────────────────────────────────────────────────────────────
//  LOGIN
// ───────────────────────────────────────────────────────────────
client.login(TOKEN);
