import type { ChoiceProvider } from "../src/core/phrase/formatter";
import type { Choice, DynamicChoiceSource } from "../src/core/registry/fields";

type Entry = readonly [value: string, en: string, ru: string];

const ABILITIES: readonly Entry[] = [
  ["str", "Strength", "Сила"], ["dex", "Dexterity", "Ловкость"], ["con", "Constitution", "Телосложение"],
  ["int", "Intelligence", "Интеллект"], ["wis", "Wisdom", "Мудрость"], ["cha", "Charisma", "Харизма"]
];

const LEVELS: readonly Entry[] = Array.from({ length: 9 }, (_, index): Entry => [`${index + 1}`, `Level ${index + 1}`, `${index + 1} уровень`]);

const TABLE: Partial<Record<DynamicChoiceSource, readonly Entry[]>> = {
  abilities: ABILITIES,
  throwTypes: [...ABILITIES, ["death", "Death save", "Спасбросок от смерти"], ["concentration", "Concentration", "Концентрация"]],
  skills: [
    ["acr", "Acrobatics", "Акробатика"], ["ani", "Animal Handling", "Уход за животными"], ["arc", "Arcana", "Магия"],
    ["ath", "Athletics", "Атлетика"], ["dec", "Deception", "Обман"], ["his", "History", "История"],
    ["ins", "Insight", "Проницательность"], ["itm", "Intimidation", "Запугивание"], ["inv", "Investigation", "Анализ"],
    ["med", "Medicine", "Медицина"], ["nat", "Nature", "Природа"], ["prc", "Perception", "Внимательность"],
    ["prf", "Performance", "Выступление"], ["per", "Persuasion", "Убеждение"], ["rel", "Religion", "Религия"],
    ["slt", "Sleight of Hand", "Ловкость рук"], ["ste", "Stealth", "Скрытность"], ["sur", "Survival", "Выживание"]
  ],
  tools: [
    ["thief", "Thieves' Tools", "Воровские инструменты"], ["herb", "Herbalism Kit", "Набор травника"],
    ["alchemist", "Alchemist's Supplies", "Инструменты алхимика"], ["smith", "Smith's Tools", "Инструменты кузнеца"],
    ["disg", "Disguise Kit", "Набор для грима"], ["navg", "Navigator's Tools", "Инструменты навигатора"]
  ],
  damageAndHealingTypes: [
    ["acid", "Acid", "Кислота"], ["bludgeoning", "Bludgeoning", "Дробящий"], ["cold", "Cold", "Холод"],
    ["fire", "Fire", "Огонь"], ["force", "Force", "Силовое поле"], ["lightning", "Lightning", "Электричество"],
    ["necrotic", "Necrotic", "Некротическая энергия"], ["piercing", "Piercing", "Колющий"], ["poison", "Poison", "Яд"],
    ["psychic", "Psychic", "Психическая энергия"], ["radiant", "Radiant", "Излучение"], ["slashing", "Slashing", "Рубящий"],
    ["thunder", "Thunder", "Звук"], ["healing", "Healing", "Лечение"], ["temphp", "Temporary HP", "Временные хиты"]
  ],
  creatureTypes: [
    ["aberration", "Aberration", "Аберрация"], ["beast", "Beast", "Зверь"], ["celestial", "Celestial", "Небожитель"],
    ["construct", "Construct", "Конструкт"], ["dragon", "Dragon", "Дракон"], ["elemental", "Elemental", "Элементаль"],
    ["fey", "Fey", "Фея"], ["fiend", "Fiend", "Исчадие"], ["giant", "Giant", "Великан"], ["humanoid", "Humanoid", "Гуманоид"],
    ["monstrosity", "Monstrosity", "Монстр"], ["ooze", "Ooze", "Слизь"], ["plant", "Plant", "Растение"], ["undead", "Undead", "Нежить"]
  ],
  actorSizes: [
    ["tiny", "Tiny", "Крошечный"], ["sm", "Small", "Маленький"], ["med", "Medium", "Средний"],
    ["lg", "Large", "Большой"], ["huge", "Huge", "Огромный"], ["grg", "Gargantuan", "Громадный"]
  ],
  statusEffects: [
    ["blinded", "Blinded", "Ослеплён"], ["charmed", "Charmed", "Очарован"], ["deafened", "Deafened", "Оглушён"],
    ["exhaustion", "Exhaustion", "Истощение"], ["frightened", "Frightened", "Испуган"], ["grappled", "Grappled", "Схвачен"],
    ["incapacitated", "Incapacitated", "Недееспособен"], ["invisible", "Invisible", "Невидим"],
    ["paralyzed", "Paralyzed", "Парализован"], ["petrified", "Petrified", "Окаменевший"], ["poisoned", "Poisoned", "Отравлен"],
    ["prone", "Prone", "Сбит с ног"], ["restrained", "Restrained", "Опутан"], ["stunned", "Stunned", "Ошеломлён"],
    ["unconscious", "Unconscious", "Без сознания"], ["concentrating", "Concentrating", "Концентрация"],
    ["bleeding", "Bleeding", "Кровотечение"]
  ],
  armorTypes: [
    ["light", "Light armor", "Лёгкий доспех"], ["medium", "Medium armor", "Средний доспех"], ["heavy", "Heavy armor", "Тяжёлый доспех"],
    ["shield", "Shield", "Щит"], ["leather", "Leather armor", "Кожаный доспех"], ["chainmail", "Chain mail", "Кольчуга"],
    ["plate", "Plate armor", "Латы"]
  ],
  weaponTypes: [
    ["longsword", "Longsword", "Длинный меч"], ["shortsword", "Shortsword", "Короткий меч"], ["greatsword", "Greatsword", "Двуручный меч"],
    ["dagger", "Dagger", "Кинжал"], ["rapier", "Rapier", "Рапира"], ["battleaxe", "Battleaxe", "Боевой топор"],
    ["handaxe", "Handaxe", "Ручной топор"], ["longbow", "Longbow", "Длинный лук"], ["shortbow", "Shortbow", "Короткий лук"],
    ["lightcrossbow", "Light crossbow", "Лёгкий арбалет"], ["quarterstaff", "Quarterstaff", "Боевой посох"],
    ["warhammer", "Warhammer", "Боевой молот"]
  ],
  weaponProperties: [
    ["fin", "Finesse", "Фехтовальное"], ["lgt", "Light", "Лёгкое"], ["hvy", "Heavy", "Тяжёлое"], ["two", "Two-handed", "Двуручное"],
    ["thr", "Thrown", "Метательное"], ["ver", "Versatile", "Универсальное"], ["rch", "Reach", "Досягаемость"],
    ["amm", "Ammunition", "Боеприпасы"], ["lod", "Loading", "Перезарядка"], ["mgc", "Magical", "Магическое"],
    ["sil", "Silvered", "Посеребрённое"], ["ada", "Adamantine", "Адамантиновое"]
  ],
  spellSchools: [
    ["abj", "Abjuration", "Ограждение"], ["con", "Conjuration", "Вызов"], ["div", "Divination", "Прорицание"],
    ["enc", "Enchantment", "Очарование"], ["evo", "Evocation", "Воплощение"], ["ill", "Illusion", "Иллюзия"],
    ["nec", "Necromancy", "Некромантия"], ["trs", "Transmutation", "Преобразование"]
  ],
  spellLevels: [["0", "Cantrip", "Заговор"], ...LEVELS],
  spellComponents: [
    ["vocal", "Verbal", "Вербальный"], ["somatic", "Somatic", "Соматический"], ["material", "Material", "Материальный"],
    ["concentration", "Concentration", "Концентрация"], ["ritual", "Ritual", "Ритуал"]
  ],
  spellMethods: [
    ["spell", "Spellcasting", "Сотворение заклинаний"], ["pact", "Pact magic", "Магия договора"],
    ["innate", "Innate", "Врождённое колдовство"], ["atwill", "At will", "Неограниченно"], ["ritual", "Ritual only", "Только ритуал"]
  ],
  itemTypes: [
    ["weapon", "Weapon", "Оружие"], ["equipment", "Equipment", "Снаряжение"], ["consumable", "Consumable", "Расходуемое"],
    ["tool", "Tool", "Инструмент"], ["feat", "Feature", "Особенность"], ["spell", "Spell", "Заклинание"]
  ],
  attackTypes: [["melee", "Melee", "Рукопашная"], ["ranged", "Ranged", "Дальнобойная"]],
  attackClassifications: [["weapon", "Weapon", "Оружием"], ["spell", "Spell", "Заклинанием"], ["unarmed", "Unarmed", "Безоружная"]],
  attackModes: [
    ["oneHanded", "One-handed", "Одной рукой"], ["twoHanded", "Two-handed", "Двумя руками"], ["offhand", "Off-hand", "Второй рукой"],
    ["thrown", "Thrown", "Метание"], ["thrown-offhand", "Thrown off-hand", "Метание второй рукой"]
  ],
  proficiencyLevels: [
    ["0", "Not proficient", "Не владеет"], ["0.5", "Half proficient", "Половина бонуса"], ["1", "Proficient", "Владеет"],
    ["2", "Expertise", "Компетентность"]
  ],
  languages: [
    ["common", "Common", "Общий"], ["dwarvish", "Dwarvish", "Дварфийский"], ["elvish", "Elvish", "Эльфийский"],
    ["draconic", "Draconic", "Драконий"], ["infernal", "Infernal", "Инфернальный"], ["celestial", "Celestial", "Небесный"],
    ["sylvan", "Sylvan", "Сильван"], ["undercommon", "Undercommon", "Глубинный"]
  ],
  featureTypes: [
    ["background", "Background", "Предыстория"], ["class", "Class feature", "Классовая особенность"], ["feat", "Feat", "Черта"],
    ["monster", "Monster feature", "Особенность монстра"], ["race", "Species feature", "Особенность вида"],
    ["supernaturalGift", "Supernatural gift", "Сверхъестественный дар"]
  ],
  currencies: [["pp", "Platinum", "Платина"], ["gp", "Gold", "Золото"], ["ep", "Electrum", "Электрум"], ["sp", "Silver", "Серебро"], ["cp", "Copper", "Медь"]],
  spellSlotLevels: [
    ...Array.from({ length: 9 }, (_, index): Entry => [`spell${index + 1}`, `level ${index + 1}`, `${index + 1} уровня`]),
    ["pact", "pact", "договора"]
  ],
  documentEffects: [["bless-blade", "Blessing of the blade", "Благословение клинка"], ["poison-coat", "Poison coating", "Ядовитое покрытие"]]
};

/** dnd5e-like choice lists so the playground shows real labels in both languages. */
export function createMockChoices(language: "en" | "ru"): ChoiceProvider {
  const cache = new Map<DynamicChoiceSource, Choice[]>();
  return {
    choices(source) {
      let list = cache.get(source);
      if (!list) {
        list = (TABLE[source] ?? []).map(([value, en, ru]) => ({ value, label: (language === "ru") ? ru : en }));
        cache.set(source, list);
      }
      return list;
    }
  };
}
