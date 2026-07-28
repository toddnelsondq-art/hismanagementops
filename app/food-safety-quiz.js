(() => {
  const DEFAULT_SESSION_SIZE = 10;
  const managerDomainWeights = {
    'Management of Food Safety Practices': 10,
    'Hygiene and Health': 15,
    'Safe Receipt, Storage, Transportation and Disposal': 16.25,
    'Safe Preparation and Cooking': 18.75,
    'Safe Service and Display': 10,
    'Cleanliness and Sanitation': 15,
    'Facilities and Equipment': 15
  };
  const app = document.querySelector('#foodSafetyQuizApp');
  if (!app || !window.foodSafetyQuestionBank) return;

  const trackInfo = {
    employee: {
      title: 'Employee Essentials',
      icon: '🧤',
      description: 'Daily food handling, hygiene, temperatures, allergens, storage, and sanitation.'
    },
    manager: {
      title: 'Manager Practice',
      icon: '📋',
      description: 'Manager-level controls, HACCP, employee health, facilities, emergencies, and compliance.'
    }
  };

  let session = null;
  let selectedChoice = null;
  let answerRevealed = false;

  function signedInUser() {
    try {
      if (typeof currentUser === 'function') return currentUser() || {};
    } catch {}
    return {};
  }

  function userKey() {
    const user = signedInUser();
    return String(user.id || user.email || user.name || 'guest').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  }

  function storageKey() {
    return `dqops-food-safety-history-${userKey()}`;
  }

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveHistory(entry) {
    const history = [entry, ...readHistory()].slice(0, 30);
    localStorage.setItem(storageKey(), JSON.stringify(history));
  }

  function isManager() {
    return signedInUser().role && signedInUser().role !== 'Employee' && signedInUser().role !== 'Maintenance Tech';
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function randomizeChoices(question) {
    const choices = shuffle(question.choices.map((text, originalIndex) => ({ text, originalIndex })));
    return {
      ...question,
      choices: choices.map(choice => choice.text),
      answer: choices.findIndex(choice => choice.originalIndex === question.answer)
    };
  }

  function inferredDomain(question) {
    if (question.domain) return question.domain;
    const category = question.category;
    if (['Active Managerial Control','HACCP','Special Processes','Food Defense','Regulatory Compliance'].includes(category)) return 'Management of Food Safety Practices';
    if (['Highly Susceptible Populations','Employee Health','Personal Hygiene','Vomiting and Diarrheal Events','Foodborne Illness'].includes(category)) return 'Hygiene and Health';
    if (['Date Marking','Receiving and Records','Receiving','Approved Sources','Recall Response'].includes(category)) return 'Safe Receipt, Storage, Transportation and Disposal';
    if (['Cooling','Time as a Public Health Control','Time and Temperature','TCS Food','Cooking','Cross-Contamination','Thermometers'].includes(category)) return 'Safe Preparation and Cooking';
    if (['Consumer Advisory','Self-Service','Allergen Management'].includes(category)) return 'Safe Service and Display';
    if (category === 'Cleaning and Sanitizing') return 'Cleanliness and Sanitation';
    return 'Facilities and Equipment';
  }

  function weightedManagerQuestions(bank, count) {
    const domains = Object.keys(managerDomainWeights);
    const raw = domains.map(domain => ({
      domain,
      exact: count * managerDomainWeights[domain] / 100,
      quota: Math.floor(count * managerDomainWeights[domain] / 100)
    }));
    let remainingSlots = count - raw.reduce((sum, item) => sum + item.quota, 0);
    shuffle(raw).sort((a, b) => (b.exact - b.quota) - (a.exact - a.quota)).forEach(item => {
      if (remainingSlots > 0) {
        item.quota += 1;
        remainingSlots -= 1;
      }
    });

    const selected = [];
    raw.forEach(item => {
      selected.push(...shuffle(bank.filter(question => inferredDomain(question) === item.domain)).slice(0, item.quota));
    });
    if (selected.length < count) {
      const selectedIds = new Set(selected.map(question => question.id));
      selected.push(...shuffle(bank.filter(question => !selectedIds.has(question.id))).slice(0, count - selected.length));
    }
    return shuffle(selected);
  }

  function balancedQuestions(track, requestedIds = [], requestedCount = DEFAULT_SESSION_SIZE) {
    const bank = window.foodSafetyQuestionBank[track] || [];
    if (requestedIds.length) {
      const requested = shuffle(bank.filter(question => requestedIds.includes(question.id)));
      if (requested.length) return requested.slice(0, requestedCount);
    }

    if (track === 'manager') return weightedManagerQuestions(bank, Math.min(requestedCount, bank.length));

    const groups = new Map();
    shuffle(bank).forEach(question => {
      if (!groups.has(question.category)) groups.set(question.category, []);
      groups.get(question.category).push(question);
    });
    const categories = shuffle([...groups.keys()]);
    const chosen = [];
    let round = 0;
    while (chosen.length < Math.min(requestedCount, bank.length)) {
      let added = false;
      categories.forEach(category => {
        const question = groups.get(category)[round];
        if (question && chosen.length < requestedCount) {
          chosen.push(question);
          added = true;
        }
      });
      if (!added) break;
      round += 1;
    }
    return shuffle(chosen);
  }

  function startQuiz(track, requestedIds = [], requestedCount = DEFAULT_SESSION_SIZE) {
    if (track === 'manager' && !isManager()) return;
    const questions = balancedQuestions(track, requestedIds, requestedCount).map(randomizeChoices);
    session = { track, questions, requestedCount, index: 0, answers: [], startedAt: new Date().toISOString() };
    selectedChoice = null;
    answerRevealed = false;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHome() {
    session = null;
    selectedChoice = null;
    answerRevealed = false;
    const history = readHistory();
    const recentMissed = [...new Set(history.flatMap(entry => entry.missedIds || []))];
    const managerCard = isManager() ? `
      <article class="quiz-track-card">
        <span class="quiz-track-icon">${trackInfo.manager.icon}</span>
        <b>${trackInfo.manager.title}</b>
        <p>${trackInfo.manager.description}</p>
        <span class="status">${window.foodSafetyQuestionBank.manager.length}-question bank</span>
        <div class="quiz-length-actions"><button data-quiz-start="manager" data-quiz-count="10" type="button">10 questions</button><button class="ghost" data-quiz-start="manager" data-quiz-count="25" type="button">25 questions</button></div>
      </article>` : '';
    const historyMarkup = history.length ? history.slice(0, 6).map(entry => `
      <div class="quiz-history-row">
        <div><b>${escapeText(trackInfo[entry.track]?.title || entry.track)}</b><p class="hint">${new Date(entry.completedAt).toLocaleString()}</p></div>
        <b>${entry.score}/${entry.total} · ${Math.round((entry.score / entry.total) * 100)}%</b>
      </div>`).join('') : '<p class="quiz-empty">Complete a practice quiz and your recent scores will appear here.</p>';

    app.innerHTML = `
      <article class="card">
        <p class="eyebrow">CHOOSE A STUDY TRACK</p>
        <h3>Choose a quick or extended practice session</h3>
        <p class="hint">Manager questions are weighted across the seven official exam domains and reshuffled each time.</p>
        <div class="quiz-track-grid">
          <article class="quiz-track-card">
            <span class="quiz-track-icon">${trackInfo.employee.icon}</span>
            <b>${trackInfo.employee.title}</b>
            <p>${trackInfo.employee.description}</p>
            <span class="status">${window.foodSafetyQuestionBank.employee.length}-question bank</span>
            <div class="quiz-length-actions"><button data-quiz-start="employee" data-quiz-count="10" type="button">10 questions</button><button class="ghost" data-quiz-start="employee" data-quiz-count="25" type="button">25 questions</button></div>
          </article>
          ${managerCard}
        </div>
        ${recentMissed.length ? `<button class="ghost" data-quiz-missed type="button">Practice recently missed questions</button>` : ''}
      </article>
      <article class="card">
        <div class="maintenance-row compact"><div><p class="eyebrow">MY PROGRESS</p><h3>Recent attempts</h3></div><span class="status">Saved on this device</span></div>
        <div class="quiz-history-list">${historyMarkup}</div>
      </article>`;
  }

  function renderQuestion() {
    const question = session.questions[session.index];
    const progress = Math.round((session.index / session.questions.length) * 100);
    const optionMarkup = question.choices.map((choice, index) => {
      const classes = ['quiz-option'];
      if (selectedChoice === index) classes.push('selected');
      if (answerRevealed && index === question.answer) classes.push('correct');
      if (answerRevealed && selectedChoice === index && index !== question.answer) classes.push('incorrect');
      return `<button class="${classes.join(' ')}" data-quiz-choice="${index}" type="button" ${answerRevealed ? 'disabled' : ''}>
        <span class="quiz-letter">${String.fromCharCode(65 + index)}</span><span>${escapeText(choice)}</span>
      </button>`;
    }).join('');
    const feedback = answerRevealed ? `
      <article class="card quiz-feedback ${selectedChoice === question.answer ? '' : 'incorrect'}">
        <h3>${selectedChoice === question.answer ? 'Correct' : `Correct answer: ${escapeText(question.choices[question.answer])}`}</h3>
        <p>${escapeText(question.explanation)}</p>
      </article>` : '';
    const isLast = session.index === session.questions.length - 1;

    app.innerHTML = `
      <div class="quiz-progress-label"><b>${escapeText(trackInfo[session.track].title)}</b><span>Question ${session.index + 1} of ${session.questions.length}</span></div>
      <div class="quiz-progress"><span style="width:${progress}%"></span></div>
      <article class="card">
        <span class="quiz-category">${escapeText(question.category)}</span>
        <h3 class="quiz-question">${escapeText(question.question)}</h3>
        <div class="quiz-options">${optionMarkup}</div>
        ${feedback}
        <div class="quiz-actions">
          <button class="ghost" data-quiz-exit type="button">Exit quiz</button>
          ${answerRevealed
            ? `<button data-quiz-next type="button">${isLast ? 'See results' : 'Next question'}</button>`
            : `<button data-quiz-submit type="button" ${selectedChoice === null ? 'disabled' : ''}>Check answer</button>`}
        </div>
      </article>`;
  }

  function submitAnswer() {
    if (selectedChoice === null || answerRevealed) return;
    const question = session.questions[session.index];
    session.answers.push({ questionId: question.id, selected: selectedChoice, correct: selectedChoice === question.answer });
    answerRevealed = true;
    renderQuestion();
  }

  function nextQuestion() {
    if (!answerRevealed) return;
    if (session.index >= session.questions.length - 1) return finishQuiz();
    session.index += 1;
    selectedChoice = null;
    answerRevealed = false;
    renderQuestion();
  }

  function finishQuiz() {
    const score = session.answers.filter(answer => answer.correct).length;
    const missedIds = session.answers.filter(answer => !answer.correct).map(answer => answer.questionId);
    const result = {
      id: `quiz-${Date.now()}`,
      track: session.track,
      score,
      total: session.questions.length,
      completedAt: new Date().toISOString(),
      missedIds
    };
    saveHistory(result);
    renderResults(result);
  }

  function renderResults(result) {
    const percent = Math.round((result.score / result.total) * 100);
    const review = session.questions.map((question, index) => {
      const answer = session.answers[index];
      return `<article class="card quiz-review-item ${answer.correct ? '' : 'missed'}">
        <h3>${index + 1}. ${escapeText(question.question)}</h3>
        <p><b>Your answer:</b> ${escapeText(question.choices[answer.selected])}</p>
        ${answer.correct ? '' : `<p><b>Correct answer:</b> ${escapeText(question.choices[question.answer])}</p>`}
        <p class="hint">${escapeText(question.explanation)}</p>
      </article>`;
    }).join('');
    app.innerHTML = `
      <article class="card quiz-score-card">
        <p class="eyebrow">SESSION COMPLETE</p>
        <h2>${escapeText(trackInfo[session.track].title)}</h2>
        <div class="quiz-score-ring" style="--score:${percent}%"><b>${percent}%</b></div>
        <p>You answered <b>${result.score} of ${result.total}</b> questions correctly.</p>
        <div class="quiz-actions">
          <button class="ghost" data-quiz-home type="button">Training home</button>
          ${result.missedIds.length ? '<button data-quiz-retry-missed type="button">Practice missed questions</button>' : `<button data-quiz-restart type="button">New ${session.requestedCount}-question quiz</button>`}
        </div>
      </article>
      <div class="section-title"><h3>Answer review</h3><span>${result.total} questions</span></div>
      ${review}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  app.addEventListener('click', event => {
    const start = event.target.closest('[data-quiz-start]');
    if (start) return startQuiz(start.dataset.quizStart, [], Number(start.dataset.quizCount) || DEFAULT_SESSION_SIZE);
    const choice = event.target.closest('[data-quiz-choice]');
    if (choice && !answerRevealed) {
      selectedChoice = Number(choice.dataset.quizChoice);
      return renderQuestion();
    }
    if (event.target.closest('[data-quiz-submit]')) return submitAnswer();
    if (event.target.closest('[data-quiz-next]')) return nextQuestion();
    if (event.target.closest('[data-quiz-exit]') || event.target.closest('[data-quiz-home]')) return renderHome();
    if (event.target.closest('[data-quiz-restart]')) return startQuiz(session.track, [], session.requestedCount);
    if (event.target.closest('[data-quiz-retry-missed]')) {
      const missed = session.answers.filter(answer => !answer.correct).map(answer => answer.questionId);
      return startQuiz(session.track, missed, Math.min(session.requestedCount, missed.length));
    }
    if (event.target.closest('[data-quiz-missed]')) {
      const history = readHistory();
      const managerMissed = history.find(entry => entry.track === 'manager' && entry.missedIds?.length);
      const employeeMissed = history.find(entry => entry.track === 'employee' && entry.missedIds?.length);
      const selected = isManager() ? (managerMissed || employeeMissed) : employeeMissed;
      if (selected) return startQuiz(selected.track, [...new Set(history.filter(entry => entry.track === selected.track).flatMap(entry => entry.missedIds || []))], DEFAULT_SESSION_SIZE);
    }
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-view="trainingView"], [data-section-view="trainingView"]')) {
      window.setTimeout(renderHome, 0);
    }
  });

  renderHome();
})();
