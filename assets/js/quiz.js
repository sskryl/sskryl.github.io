// ============================================================================
//  Психотест для сайта (порт bot/quiz.py). Вопросы, скоринг по жанрам,
//  определение психотипа. ID жанров совместимы с TMDB.
// ============================================================================
(function () {
  "use strict";
  const A = 28, ADV = 12, ANIM = 16, COM = 35, CR = 80, DOC = 99, DR = 18,
        FAM = 10751, FAN = 14, HIS = 36, HOR = 27, MYS = 9648, ROM = 10749,
        SF = 878, TH = 53, WAR = 10752;

  const QUESTIONS = [
    { text: "Какое у тебя сейчас настроение?", options: [
      { label: "😌 Спокойное, хочу расслабиться", weights: { [DR]: 2, [ROM]: 2, [FAM]: 1 } },
      { label: "⚡ Бодрое, хочу драйва", weights: { [A]: 3, [ADV]: 2, [TH]: 1 } },
      { label: "🤔 Задумчивое, хочу поразмышлять", weights: { [DR]: 2, [MYS]: 2, [SF]: 2 } },
      { label: "😈 Хочу пощекотать нервы", weights: { [HOR]: 3, [TH]: 2, [CR]: 1 } },
    ]},
    { text: "Идеальный вечер — это…", options: [
      { label: "🍵 Плед, чай и тишина", weights: { [FAM]: 2, [ROM]: 2, [COM]: 1 } },
      { label: "🎉 Шумная компания друзей", weights: { [COM]: 3, [ADV]: 1 } },
      { label: "📚 В одиночестве с книгой", weights: { [DR]: 2, [MYS]: 2, [HIS]: 1 } },
      { label: "🔥 Что-то экстремальное", weights: { [A]: 2, [HOR]: 2, [TH]: 1 } },
    ]},
    { text: "Ты по натуре скорее…", options: [
      { label: "🧩 Логик, обожаю головоломки", weights: { [MYS]: 3, [CR]: 2, [SF]: 1 } },
      { label: "💖 Романтик, ценю чувства", weights: { [ROM]: 3, [DR]: 2 } },
      { label: "🧭 Авантюрист, люблю риск", weights: { [ADV]: 3, [A]: 2 } },
      { label: "🌑 Скептик, тянет к мрачному", weights: { [HOR]: 2, [TH]: 2, [CR]: 1 } },
    ]},
    { text: "Куда бы отправился в идеальное путешествие?", options: [
      { label: "🚀 В другую галактику", weights: { [SF]: 3, [FAN]: 2 } },
      { label: "🏰 В заброшенный старинный замок", weights: { [HOR]: 2, [MYS]: 2, [FAN]: 1 } },
      { label: "🌆 В огромный шумный мегаполис", weights: { [CR]: 2, [DR]: 2, [COM]: 1 } },
      { label: "🏔 В дикую нетронутую природу", weights: { [ADV]: 3, [FAM]: 1 } },
    ]},
    { text: "Какой финал истории тебе ближе?", options: [
      { label: "😊 Счастливый, со слезами радости", weights: { [ROM]: 2, [FAM]: 2, [COM]: 1 } },
      { label: "🌀 Неожиданный твист", weights: { [MYS]: 2, [TH]: 2, [SF]: 1 } },
      { label: "💔 Трагичный, но глубокий", weights: { [DR]: 3, [WAR]: 1, [HIS]: 1 } },
      { label: "👻 Чтобы было жутко до титров", weights: { [HOR]: 3 } },
    ]},
    { text: "Какой темп жизни тебе ближе?", options: [
      { label: "🐢 Медленный и вдумчивый", weights: { [DR]: 2, [HIS]: 2, [ROM]: 1 } },
      { label: "🏎 Быстрый, на адреналине", weights: { [A]: 3, [TH]: 1, [ADV]: 1 } },
      { label: "🎲 Непредсказуемый", weights: { [MYS]: 2, [CR]: 2, [SF]: 1 } },
      { label: "🙂 Лёгкий и с юмором", weights: { [COM]: 3, [FAM]: 1 } },
    ]},
    { text: "Выбери цитату, которая откликается:", options: [
      { label: "«Любовь спасёт мир»", weights: { [ROM]: 3, [DR]: 1 } },
      { label: "«Истина где-то рядом»", weights: { [SF]: 2, [MYS]: 2 } },
      { label: "«Кто не рискует — тот не пьёт шампанского»", weights: { [ADV]: 2, [A]: 2 } },
      { label: "«Бойтесь своих желаний»", weights: { [HOR]: 2, [TH]: 2 } },
    ]},
    { text: "Насколько ты готов к необычному и странному?", options: [
      { label: "🛸 Обожаю сюрреализм и странное", weights: { [SF]: 2, [FAN]: 2, [HOR]: 1 } },
      { label: "🎞 Только проверенная классика", weights: { [DR]: 2, [HIS]: 2, [ROM]: 1 } },
      { label: "🍿 Что-то лёгкое и понятное", weights: { [COM]: 2, [FAM]: 2 } },
      { label: "🩸 Тёмное и интенсивное", weights: { [CR]: 2, [TH]: 2, [WAR]: 1 } },
    ]},
  ];

  const ARCHETYPES = [
    { key: "adrenaline", title: "🔥 Искатель адреналина", genres: [HOR, TH],
      desc: "Тебе нужны напряжение и мурашки. Любишь, когда сердце колотится, а сюжет держит до последней минуты." },
    { key: "dreamer", title: "🚀 Мечтатель-фантазёр", genres: [SF, FAN],
      desc: "Тебя тянет за пределы привычного — к иным мирам и магии. Кино для тебя — портал в невозможное." },
    { key: "detective", title: "🕵️ Аналитик-детектив", genres: [MYS, CR],
      desc: "Любишь распутывать загадки и просчитывать ходы. Ценишь интригу и неожиданные повороты." },
    { key: "romantic", title: "💖 Романтик-эмпат", genres: [ROM, DR],
      desc: "Ценишь живые эмоции и истории о людях. Тебе важно сопереживать героям." },
    { key: "soul", title: "😄 Душа компании", genres: [COM, FAM],
      desc: "Тебе по душе лёгкость, юмор и тепло. Кино — способ улыбнуться и зарядиться настроением." },
    { key: "adventurer", title: "🧭 Авантюрист", genres: [ADV, A],
      desc: "Вечно в движении и жаждешь приключений. Тебе нужны действие и размах." },
    { key: "thinker", title: "📜 Мыслитель-эрудит", genres: [DR, HIS, WAR],
      desc: "Тебя притягивают глубокие истории о времени и судьбах. Ищешь в кино смысл." },
  ];

  function score(answers) {
    const totals = {};
    answers.forEach(([qi, oi]) => {
      const w = QUESTIONS[qi].options[oi].weights;
      for (const g in w) totals[g] = (totals[g] || 0) + w[g];
    });
    return totals;
  }

  function topGenres(scores, n) {
    return Object.keys(scores)
      .map(Number)
      .sort((a, b) => scores[b] - scores[a])
      .slice(0, n);
  }

  function detect(scores) {
    let best = ARCHETYPES[0], bestScore = -1;
    for (const arch of ARCHETYPES) {
      const s = arch.genres.reduce((acc, g) => acc + (scores[g] || 0), 0);
      if (s > bestScore) { bestScore = s; best = arch; }
    }
    return best;
  }

  window.Quiz = { QUESTIONS, ARCHETYPES, score, topGenres, detect };
})();
