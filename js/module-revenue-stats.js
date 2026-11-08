// ── goTo hook patch (orig. line 11307) ──
// FIX (perf 2026-07) : ce module est maintenant chargé dynamiquement APRÈS
// core.js (voir loader dans app.html), donc DOMContentLoaded est déjà passé
// au moment où ce fichier s'exécute — l'ancien listener ne se déclenchait
// alors jamais. window.goTo existe déjà (défini dans core.js, chargé avant),
// donc on patche directement, sans attendre d'event.
(function() {
  const origGoTo = window.goTo;
  window.goTo = function(pageId, el) {
    if(pageId === 'revenue-stats') {
      setTimeout(() => renderRevenueStats(), 100);
    }
    return origGoTo.call(this, pageId, el);
  };
})();
// ── switchRevenueTab (orig. line 11323) ──
/* ═══════════════════════════════════════════════════════════
   REVENUE STATISTICS — CORRECTED & ENHANCED v2
   ═══════════════════════════════════════════════════════════ */

var g_revenueTab = 'daily';

function switchRevenueTab(tab) {
  g_revenueTab = tab;
  document.querySelectorAll('#page-revenue-stats .mod-pill').forEach(c => c.classList.remove('on','active'));
  document.getElementById('tab-' + tab).classList.add('on');

  // Le bandeau du haut (#revenue-summary) ne sert que pour Daily/Monthly/Yearly,
  // qui n'ont pas leur propre résumé. Overview, Profit, Vehicle, Category et ROI
  // affichent déjà leurs propres KPI — le montrer aussi ici faisait doublon
  // (ex: "Total Revenue" affiché 2-3x en même temps sur Overview/Profit).
  const summaryBar = document.getElementById('revenue-summary');
  if (summaryBar) summaryBar.style.display = (tab === 'daily' || tab === 'monthly' || tab === 'yearly') ? 'flex' : 'none';

  document.getElementById('revenue-daily-section').style.display = tab === 'daily' ? 'block' : 'none';
  document.getElementById('revenue-monthly-section').style.display = tab === 'monthly' ? 'block' : 'none';
  document.getElementById('revenue-yearly-section').style.display = tab === 'yearly' ? 'block' : 'none';
  document.getElementById('revenue-vehicle-section').style.display = tab === 'vehicle' ? 'block' : 'none';
  document.getElementById('revenue-profit-section').style.display = tab === 'profit' ? 'block' : 'none';
  const catSection = document.getElementById('revenue-category-section');
  if (catSection) catSection.style.display = tab === 'category' ? 'block' : 'none';
  const ovSection = document.getElementById('revenue-overview-section');
  if (ovSection) ovSection.style.display = tab === 'overview' ? 'block' : 'none';
  const roiSection = document.getElementById('revenue-roi-section');
  if (roiSection) roiSection.style.display = tab === 'roi' ? 'block' : 'none';

  if (tab === 'overview') {
    renderOverviewStats();
  } else if (tab === 'roi') {
    renderRoiStats();
  } else if (tab === 'category') {
    renderCategoryStats();
  } else if (tab === 'yearly') {
    populateYearSelects();
    renderYearlyStats();
  } else if (tab === 'vehicle') {
    populateVehicleSelect();
    const monthInput = document.getElementById('vehicle-month-from');
    if (monthInput && !monthInput.value) {
      const now = new Date();
      monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    renderVehicleStats();
  } else if (tab === 'profit') {
    const monthInput = document.getElementById('profit-month-from');
    const monthInputTo = document.getElementById('profit-month-to');
    if (monthInput && !monthInput.value) {
      const now = new Date();
      const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      monthInput.value = cur;
      if (monthInputTo) monthInputTo.value = cur;
    }
    renderProfitStats();
  } else {
    renderRevenueStats();
  }
}

// ── openRevenueStats (orig. line 11355) ──
function openRevenueStats() {
  goTo('revenue-stats', document.querySelector('.nav-item[onclick*="revenue-stats"]'));
  renderRevenueStats();
}

// ── renderRevenueStats (orig. line 11360) ──
function renderRevenueStats() {
  ensurePageLoaded('revenue-stats');
  // Use DB (the app's global data store)
  const data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  const payments = data.payments || [];
  const rentals = data.rentals || [];

  if(payments.length === 0 && rentals.length === 0) {
    document.getElementById('revenue-summary').innerHTML = '<div class="stat-card red" style="grid-column:1/-1"><div class="stat-label">⚠️ '+translate('rev.noData')+'</div><div class="stat-val">'+translate('rev.noPaymentsRentals')+'</div></div>';
    document.getElementById('daily-tbody').innerHTML = '<tr><td colspan="5" class="rev-empty">'+translate('rev.noDataAvailable')+'</td></tr>';
    document.getElementById('monthly-tbody').innerHTML = '<tr><td colspan="5" class="rev-empty">'+translate('rev.noDataAvailable')+'</td></tr>';
    document.getElementById('yearly-tbody').innerHTML = '<tr><td colspan="5" class="rev-empty">'+translate('rev.noDataAvailable')+'</td></tr>';
    document.getElementById('daily-chart').innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px">'+translate('rev.noDataAvailable')+'</div>';
    document.getElementById('monthly-chart').innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px">'+translate('rev.noDataAvailable')+'</div>';
    document.getElementById('yearly-chart').innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px">'+translate('rev.noDataAvailable')+'</div>';
    return;
  }

  const stats = calculateRevenueStats(payments, rentals);
  renderSummaryCards(stats);

  // Always render all three views (they're hidden by CSS, but we populate them)
  renderDailyStats(stats.daily);
  renderMonthlyStats(stats.monthly);
  renderYearlyStats(stats.yearly);

  // Also populate vehicle select for when user switches to vehicle tab
  populateVehicleSelect();
}

// ── calculateRevenueStats (orig. line 11389) ──
function calculateRevenueStats(payments, rentals) {
  // Fallback to data store if no arguments provided
  if (!payments || !rentals) {
    try {
      // Try DB first (the app's global data store)
      const dbData = (typeof DB !== 'undefined' && DB) ? DB : {};
      payments = payments || dbData.payments || [];
      rentals = rentals || dbData.rentals || [];
      // (fallback localStorage.fleetData retiré 2026-08 — cette clé n'est
      // écrite nulle part dans l'app, ce code ne s'exécutait jamais)
    } catch(e) {
      payments = payments || [];
      rentals = rentals || [];
    }
  }

  const stats = { total: 0, count: 0, daily: {}, monthly: {}, yearly: {}, methods: {}, avg: 0, max: 0, min: Infinity };

  // Helper: get amount from payment (handles 'amount', 'paid', 'price')
  function getAmount(p) {
    if (p.amount !== undefined && p.amount !== null && !isNaN(p.amount)) return parseFloat(p.amount);
    if (p.paid !== undefined && p.paid !== null && !isNaN(p.paid)) return parseFloat(p.paid);
    if (p.price !== undefined && p.price !== null && !isNaN(p.price)) return parseFloat(p.price);
    return 0;
  }

  // Helper: get date from payment
  function getDate(p) {
    if (p.date) return p.date;
    if (p.dateOut) return p.dateOut;
    if (p._date) return p._date;
    return new Date().toISOString().split('T')[0];
  }

  // Process payments
  payments.forEach(p => {
    const amount = getAmount(p);
    if (amount <= 0) return; // Skip zero/negative

    const date = normalizeDate(getDate(p));
    if (!date) return;

    stats.total += amount;
    stats.count++;
    stats.max = Math.max(stats.max, amount);
    stats.min = Math.min(stats.min, amount);

    if(!stats.daily[date]) stats.daily[date] = { amount: 0, count: 0, methods: {} };
    stats.daily[date].amount += amount;
    stats.daily[date].count++;
    const method = (p.paymentMethod || p.method || 'OTHER').toUpperCase();
    if(!stats.daily[date].methods[method]) stats.daily[date].methods[method] = 0;
    stats.daily[date].methods[method] += amount;

    const monthKey = date.substring(0, 7);
    if(!stats.monthly[monthKey]) stats.monthly[monthKey] = { amount: 0, count: 0 };
    stats.monthly[monthKey].amount += amount;
    stats.monthly[monthKey].count++;

    const yearKey = date.substring(0, 4);
    if(!stats.yearly[yearKey]) stats.yearly[yearKey] = { amount: 0, count: 0, months: {} };
    stats.yearly[yearKey].amount += amount;
    stats.yearly[yearKey].count++;
    if(!stats.yearly[yearKey].months[monthKey]) stats.yearly[yearKey].months[monthKey] = 0;
    stats.yearly[yearKey].months[monthKey] += amount;

    if(!stats.methods[method]) stats.methods[method] = { amount: 0, count: 0 };
    stats.methods[method].amount += amount;
    stats.methods[method].count++;
  });

  // Also process rentals with paid amount but no payment records (to avoid double counting, check if rental already has payments)
  rentals.forEach(r => {
    const paid = parseFloat(r.paid) || 0;
    if (paid <= 0) return;

    // Check if this rental has separate payment records
    const hasPaymentRecords = payments.some(p => 
      (p.contract && p.contract === r.contract) || 
      (p._plate && p._plate === r._plate) ||
      (p.plate && p.plate === r._plate)
    );
    if (hasPaymentRecords) return; // Skip - payments already counted

    const date = normalizeDate(r.dateOut);
    if (!date) return;

    stats.total += paid;
    stats.count++;
    stats.max = Math.max(stats.max, paid);
    stats.min = Math.min(stats.min, paid);

    if(!stats.daily[date]) stats.daily[date] = { amount: 0, count: 0, methods: {} };
    stats.daily[date].amount += paid;
    stats.daily[date].count++;

    const monthKey = date.substring(0, 7);
    if(!stats.monthly[monthKey]) stats.monthly[monthKey] = { amount: 0, count: 0 };
    stats.monthly[monthKey].amount += paid;
    stats.monthly[monthKey].count++;

    const yearKey = date.substring(0, 4);
    if(!stats.yearly[yearKey]) stats.yearly[yearKey] = { amount: 0, count: 0, months: {} };
    stats.yearly[yearKey].amount += paid;
    stats.yearly[yearKey].count++;
    if(!stats.yearly[yearKey].months[monthKey]) stats.yearly[yearKey].months[monthKey] = 0;
    stats.yearly[yearKey].months[monthKey] += paid;
  });

  stats.avg = stats.count > 0 ? stats.total / stats.count : 0;
  stats.min = stats.min === Infinity ? 0 : stats.min;
  return stats;
}

// ── normalizeDate (orig. line 11513) ──
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  // Already YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // ISO format with time: YYYY-MM-DDTHH:mm
  if(/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) return dateStr.substring(0, 10);

  // DD/MM/YYYY
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/');
    return y + '-' + m + '-' + d;
  }

  // DD-MM-YYYY
  if(/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('-');
    return y + '-' + m + '-' + d;
  }

  // Try parsing as Date
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch(e) {}

  return null;
}

// formatMonth() supprimée (2026-08) — identique à l'ex-depFormatStatsMonth()
// de module-depence.js. Remplacée par formatStatsMonth() (core.js), partagée
// entre les deux modules et localisée AR/FR/EN (l'ancienne version des deux
// modules était codée en dur en anglais).
const formatMonth = formatStatsMonth;

// ── renderSummaryCards (orig. line 11552) ──
function renderSummaryCards(stats) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  const thisYear = today.substring(0, 4);

  const todayAmount = stats.daily[today] ? stats.daily[today].amount : 0;
  const monthAmount = stats.monthly[thisMonth] ? stats.monthly[thisMonth].amount : 0;
  const yearAmount = stats.yearly[thisYear] ? stats.yearly[thisYear].amount : 0;

  const html = '<div class="stat-card green">' +
      '<div class="stat-label">' + translate('rev.totalRevenue') + '</div>' +
      '<div class="stat-val">' + stats.total.toFixed(2) + ' <span style="font-size:.9rem">OMR</span></div>' +
      '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">' + stats.count + ' ' + translate('rev.transactions') + '</div>' +
    '</div>' +
    '<div class="stat-card blue">' +
      '<div class="stat-label">' + translate('rev.avgPerTransaction') + '</div>' +
      '<div class="stat-val">' + stats.avg.toFixed(2) + ' <span style="font-size:.9rem">OMR</span></div>' +
      '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">' + translate('rev.max') + ': ' + stats.max.toFixed(2) + ' OMR</div>' +
    '</div>' +
    '<div class="stat-card purple">' +
      '<div class="stat-label">' + translate('rev.thisMonth') + '</div>' +
      '<div class="stat-val">' + monthAmount.toFixed(2) + ' <span style="font-size:.9rem">OMR</span></div>' +
      '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">' + thisMonth + '</div>' +
    '</div>' +
    '<div class="stat-card yellow">' +
      '<div class="stat-label">' + translate('rev.thisYear') + '</div>' +
      '<div class="stat-val">' + yearAmount.toFixed(2) + ' <span style="font-size:.9rem">OMR</span></div>' +
      '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">' + thisYear + '</div>' +
    '</div>';
  const el = document.getElementById('revenue-summary');
  if (el) el.innerHTML = html;
}

// ── renderDailyStats (orig. line 11585) ──
function renderDailyStats(dailyData) {
  // If called without arguments (e.g. from date filter onchange), recalculate from data store
  if (!dailyData) {
    try {
      // Try DB first (the app's global data store), then localStorage
      const data = (typeof DB !== 'undefined' && DB) ? DB : {};
      const payments = data.payments || [];
      const rentals = data.rentals || [];
      // (fallback localStorage.fleetData retiré 2026-08 — jamais écrit, mort-code)

      const stats = calculateRevenueStats(payments, rentals);
      dailyData = stats.daily || {};
    } catch(e) {
      dailyData = {};
    }
  }

  // Apply date range filter
  const fromVal = document.getElementById('daily-date-from')?.value;
  const toVal = document.getElementById('daily-date-to')?.value;

  let days = Object.keys(dailyData).sort();

  if (fromVal) {
    days = days.filter(function(d) { return d >= fromVal; });
  }
  if (toVal) {
    days = days.filter(function(d) { return d <= toVal; });
  }

  // Show last 30 days if no filter applied
  if (!fromVal && !toVal) {
    days = days.slice(-30);
  }

  const count = days.length;
  
  // Calculer le montant total filtré
  let totalAmount = 0;
  days.forEach(function(d) {
    totalAmount += dailyData[d].amount;
  });

  const countEl = document.getElementById('daily-count');
  if (countEl) countEl.textContent = count;
  
  const amountEl = document.getElementById('daily-amount');
  if (amountEl) amountEl.textContent = totalAmount.toFixed(2) + ' OMR';
  
  const tableCountEl = document.getElementById('daily-table-count');
  if (tableCountEl) tableCountEl.textContent = count + ' ' + translate('rev.days') + ' • ' + translate('rev.total') + ': ' + totalAmount.toFixed(2) + ' OMR';

  // Update filter info
  const filterInfo = document.getElementById('daily-filter-info');
  if (filterInfo) {
    if (fromVal || toVal) {
      filterInfo.textContent = translate('rev.filtered') + ': ' + (fromVal || translate('rev.start')) + ' ' + translate('rev.to') + ' ' + (toVal || translate('rev.today'));
    } else {
      filterInfo.textContent = translate('rev.showingLast30');
    }
  }

  // Chart
  const chartData = days.map(function(d) { return { label: d.substring(8) + '/' + d.substring(5, 7), value: dailyData[d].amount }; });
  const chartEl = document.getElementById('daily-chart');
  if (chartEl) chartEl.innerHTML = createBarChart(chartData, translate('rev.dailyRevenueChart'));

  // Table
  let tableHTML = '';
  days.reverse().forEach(function(day) {
    const d = dailyData[day];
    const methods = Object.entries(d.methods).map(function(e) { return e[0] + ': ' + e[1].toFixed(1); }).join(', ');
    tableHTML += '<tr>' +
      '<td><strong>' + day + '</strong></td>' +
      '<td>' + d.count + '</td>' +
      '<td style="color:var(--green);font-weight:700">' + d.amount.toFixed(2) + ' OMR</td>' +
      '<td>' + (d.count > 0 ? (d.amount / d.count).toFixed(2) : '0.00') + ' OMR</td>' +
      '<td style="font-size:.75rem;color:var(--muted)">' + methods + '</td>' +
    '</tr>';
  });
  const tbody = document.getElementById('daily-tbody');
  if (tbody) tbody.innerHTML = tableHTML || '<tr><td colspan="5" class="rev-empty">'+translate('rev.noDataAvailable')+'</td></tr>';
}

// ── clearDailyFilters (orig. line 11680) ──
function clearDailyFilters() {
  document.getElementById('daily-date-from').value = '';
  document.getElementById('daily-date-to').value = '';
  renderDailyStats();
}

// ── renderMonthlyStats (orig. line 11686) ──
function renderMonthlyStats(monthlyData) {
  // If called without arguments (e.g. from date filter onchange), recalculate from data store
  if (!monthlyData) {
    try {
      // Try DB first (the app's global data store), then localStorage
      const data = (typeof DB !== 'undefined' && DB) ? DB : {};
      const payments = data.payments || [];
      const rentals = data.rentals || [];
      // (fallback localStorage.fleetData retiré 2026-08 — jamais écrit, mort-code)

      const stats = calculateRevenueStats(payments, rentals);
      monthlyData = stats.monthly || {};
    } catch(e) {
      monthlyData = {};
    }
  }

  // Apply month range filter
  const fromVal = document.getElementById('monthly-date-from')?.value;
  const toVal = document.getElementById('monthly-date-to')?.value;

  let months = Object.keys(monthlyData).sort();

  if (fromVal) {
    months = months.filter(function(m) { return m >= fromVal; });
  }
  if (toVal) {
    months = months.filter(function(m) { return m <= toVal; });
  }

  // Show last 12 months if no filter applied
  if (!fromVal && !toVal) {
    months = months.slice(-12);
  }

  const count = months.length;
  
  // Calculer le montant total filtré
  let totalAmount = 0;
  months.forEach(function(m) {
    totalAmount += monthlyData[m].amount;
  });

  const countEl = document.getElementById('monthly-count');
  if (countEl) countEl.textContent = count;
  
  const amountEl = document.getElementById('monthly-amount');
  if (amountEl) amountEl.textContent = totalAmount.toFixed(2) + ' OMR';
  
  const tableCountEl = document.getElementById('monthly-table-count');
  if (tableCountEl) tableCountEl.textContent = count + ' ' + translate('rev.months') + ' • ' + translate('rev.total') + ': ' + totalAmount.toFixed(2) + ' OMR';

  // Update filter info
  const filterInfo = document.getElementById('monthly-filter-info');
  if (filterInfo) {
    if (fromVal || toVal) {
      filterInfo.textContent = translate('rev.filtered') + ': ' + (fromVal || translate('rev.start')) + ' ' + translate('rev.to') + ' ' + (toVal || translate('rev.today'));
    } else {
      filterInfo.textContent = translate('rev.showingLast12');
    }
  }

  // Chart
  const chartData = months.map(function(m) { return { label: formatMonth(m), value: monthlyData[m].amount }; });
  const chartEl = document.getElementById('monthly-chart');
  if (chartEl) chartEl.innerHTML = createBarChart(chartData, translate('rev.monthlyRevenueChart'));

  // Table
  let tableHTML = '';
  let prevAmount = 0;
  months.reverse().forEach(function(month, idx) {
    const d = monthlyData[month];
    const growth = idx > 0 && prevAmount > 0 ? ((d.amount - prevAmount) / prevAmount * 100).toFixed(1) : 0;
    const growthColor = growth > 0 ? 'var(--green)' : growth < 0 ? 'var(--red)' : 'var(--muted)';
    const growthIcon = growth > 0 ? '▲' : growth < 0 ? '▼' : '—';
    tableHTML += '<tr>' +
      '<td><strong>' + formatMonth(month) + '</strong></td>' +
      '<td>' + d.count + '</td>' +
      '<td style="color:var(--green);font-weight:700">' + d.amount.toFixed(2) + ' OMR</td>' +
      '<td>' + (d.count > 0 ? (d.amount / d.count).toFixed(2) : '0.00') + ' OMR</td>' +
      '<td style="color:' + growthColor + ';font-weight:600">' + growthIcon + ' ' + Math.abs(growth) + '%</td>' +
    '</tr>';
    prevAmount = d.amount;
  });
  const tbody = document.getElementById('monthly-tbody');
  if (tbody) tbody.innerHTML = tableHTML || '<tr><td colspan="5" class="rev-empty">'+translate('rev.noDataAvailable')+'</td></tr>';
}

// ── clearMonthlyFilters (orig. line 11785) ──
function clearMonthlyFilters() {
  document.getElementById('monthly-date-from').value = '';
  document.getElementById('monthly-date-to').value = '';
  renderMonthlyStats();
}

// ── renderYearlyStats (orig. line 11791) ──
function renderYearlyStats(yearlyData) {
  // Si appelé sans arguments, recalculer à partir des données
  if (!yearlyData) {
    try {
      const data = (typeof DB !== 'undefined' && DB) ? DB : {};
      const payments = data.payments || [];
      const rentals = data.rentals || [];
      // (fallback localStorage.fleetData retiré 2026-08 — jamais écrit, mort-code)

      const stats = calculateRevenueStats(payments, rentals);
      yearlyData = stats.yearly || {};
    } catch(e) {
      yearlyData = {};
    }
  }

  // Récupérer les filtres d'years
  const fromVal = document.getElementById('yearly-year-from')?.value;
  const toVal = document.getElementById('yearly-year-to')?.value;

  let years = Object.keys(yearlyData).sort();

  // Appliquer les filtres
  if (fromVal) {
    years = years.filter(function(y) { return y >= fromVal; });
  }
  if (toVal) {
    years = years.filter(function(y) { return y <= toVal; });
  }

  // Si aucun filtre, montrer les 5 dernières years
  if (!fromVal && !toVal) {
    years = years.slice(-5);
  }

  const count = years.length;
  
  // Calculer le montant total filtré
  let totalAmount = 0;
  years.forEach(function(y) {
    totalAmount += yearlyData[y].amount;
  });

  const countEl = document.getElementById('yearly-count');
  if (countEl) countEl.textContent = count;
  
  const amountEl = document.getElementById('yearly-amount');
  if (amountEl) amountEl.textContent = totalAmount.toFixed(2) + ' OMR';
  
  const tableCountEl = document.getElementById('yearly-table-count');
  if (tableCountEl) tableCountEl.textContent = count + ' ' + translate('rev.years') + ' • ' + translate('rev.total') + ': ' + totalAmount.toFixed(2) + ' OMR';

  // Update filter info
  const filterInfo = document.getElementById('yearly-filter-info');
  if (filterInfo) {
    if (fromVal || toVal) {
      filterInfo.textContent = translate('rev.filtered') + ': ' + (fromVal || translate('rev.all')) + ' ' + translate('rev.to') + ' ' + (toVal || translate('rev.now'));
    } else {
      filterInfo.textContent = translate('rev.showingLast5');
    }
  }

  // Chart
  const chartData = years.map(function(y) { return { label: y, value: yearlyData[y].amount }; });
  const chartEl = document.getElementById('yearly-chart');
  if (chartEl) chartEl.innerHTML = createBarChart(chartData, translate('rev.yearlyRevenueChart'));

  // Table
  let tableHTML = '';
  years.reverse().forEach(function(year) {
    const d = yearlyData[year];
    const monthKeys = Object.keys(d.months);
    let highestMonth = monthKeys.length > 0 ? monthKeys[0] : translate('rev.na');
    let highestAmount = monthKeys.length > 0 ? d.months[monthKeys[0]] : 0;
    monthKeys.forEach(function(m) {
      if (d.months[m] > highestAmount) {
        highestAmount = d.months[m];
        highestMonth = m;
      }
    });
    tableHTML += '<tr>' +
      '<td><strong>' + year + '</strong></td>' +
      '<td>' + d.count + '</td>' +
      '<td style="color:var(--green);font-weight:700">' + d.amount.toFixed(2) + ' OMR</td>' +
      '<td>' + (d.count > 0 ? (d.amount / d.count).toFixed(2) : '0.00') + ' OMR</td>' +
      '<td>' + (highestMonth !== translate('rev.na') ? formatMonth(highestMonth) : translate('rev.na')) + ' <span style="color:var(--green)">(' + highestAmount.toFixed(1) + ')</span></td>' +
    '</tr>';
  });
  const tbody = document.getElementById('yearly-tbody');
  if (tbody) tbody.innerHTML = tableHTML || '<tr><td colspan="5" class="rev-empty">'+translate('rev.noDataAvailable')+'</td></tr>';
}

// ── populateYearSelects (orig. line 11893) ──
function populateYearSelects() {
  // Récupérer les données
  const data = (typeof DB !== 'undefined' && DB) ? DB : {};
  const rentals = data.rentals || [];
  const payments = data.payments || [];

  // Extraire les years uniques
  const years = new Set();
  
  payments.forEach(function(p) {
    const date = p.date || p._date || '';
    if (date) {
      const year = date.substring(0, 4);
      if (year.match(/^\d{4}$/)) years.add(year);
    }
  });

  rentals.forEach(function(r) {
    const date = r.dateOut || r._dateOut || '';
    if (date) {
      const year = date.substring(0, 4);
      if (year.match(/^\d{4}$/)) years.add(year);
    }
  });

  const sortedYears = Array.from(years).sort();

  // Remplir les selects
  const fromSelect = document.getElementById('yearly-year-from');
  const toSelect = document.getElementById('yearly-year-to');

  if (fromSelect) {
    const fromValue = fromSelect.value;
    fromSelect.innerHTML = '<option value="">'+translate('rev.all')+'</option>';
    sortedYears.forEach(function(year) {
      fromSelect.innerHTML += '<option value="' + year + '">' + year + '</option>';
    });
    if (fromValue) fromSelect.value = fromValue;
  }

  if (toSelect) {
    const toValue = toSelect.value;
    toSelect.innerHTML = '<option value="">'+translate('rev.all')+'</option>';
    sortedYears.forEach(function(year) {
      toSelect.innerHTML += '<option value="' + year + '">' + year + '</option>';
    });
    if (toValue) toSelect.value = toValue;
  }
}

// ── clearYearlyFilters (orig. line 11943) ──
function clearYearlyFilters() {
  document.getElementById('yearly-year-from').value = '';
  document.getElementById('yearly-year-to').value = '';
  renderYearlyStats();
}

// ── createBarChart (orig. line 11949) ──
function createBarChart(data, title) {
  if (!data || data.length === 0) return '<div style="text-align:center;color:var(--muted);padding:40px">'+translate('rev.noDataAvailable')+'</div>';

  const values = data.map(function(d) { return d.value || 0; });
  const maxValue = Math.max.apply(Math, values);
  const height = 250;
  const barWidth = Math.max(30, Math.min(60, 800 / data.length));

  let html = '<div style="margin-bottom:8px;font-weight:700;color:var(--muted);font-size:.85rem">' + title + '</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:8px;height:' + height + 'px;overflow-x:auto;padding-bottom:4px">';

  data.forEach(function(item) {
    const pct = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
    const barHeight = Math.max(pct * 2, 2);
    const color = pct > 75 ? 'var(--green)' : pct > 40 ? 'var(--blue)' : pct > 20 ? 'var(--yellow)' : 'var(--red)';

    html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:' + barWidth + 'px;flex-shrink:0">';
    html += '<div style="font-size:.7rem;font-weight:700;color:var(--text);white-space:nowrap">' + item.value.toFixed(1) + '</div>';
    html += '<div style="width:' + barWidth + 'px;height:' + barHeight + 'px;background:' + color + ';border-radius:4px 4px 0 0;transition:height .3s;min-height:2px"></div>';
    html += '<div style="font-size:.65rem;color:var(--muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">' + item.label + '</div>';
    html += '</div>';
  });

  html += '</div>';
  return html;
}

// ── printRevStats (orig. line 11976) ──
function printRevStats() {
  window.print();
}

/* ═══════════════════════════════════════════════════════════
   🔧 NORMALIZE PLATE - FONCTION UNIQUE GLOBALE
   Utilisée PARTOUT pour garantir cohérence
   ═══════════════════════════════════════════════════════════ */
// ── normalizePlateGlobal (orig. line 11984) ──
function normalizePlateGlobal(plate) {
  if (!plate) return '';
  // Extract just the number-letter part
  // "N.PATROL 123-T" → "123-T"
  // "NISSAN 456-T" → "456-T"
  // "123-T" → "123-T"
  // "456-T" → "456-T"
  const match = plate.match(/(\d{3,4})[- ]?([A-Z]\d{0,2})/);
  if (match) {
    return match[1] + '-' + match[2];
  }
  return plate.trim().toUpperCase();
}

// ── populateVehicleSelect (orig. line 11998) ──
function populateVehicleSelect() {
  const data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  const vehicles = data.vehicles || [];
  const rentals = data.rentals || [];

  const select = document.getElementById('vehicle-select');
  if (!select) return;

  // Garder l'option "All Vehicles"
  let options = '<option value="all">'+translate('rev.allVehicles')+'</option>';

  // Récupérer toutes les plaques uniques des rentals ET des vehicles
  const allPlates = new Set();

  // Ajouter les plaques des rentals (même sans vehicle correspondant)
  rentals.forEach(function(r) {
    var plate = r._plate || r.plate || '';
    if (plate) allPlates.add(plate);
  });

  // Ajouter les plaques des vehicles (même sans rental)
  vehicles.forEach(function(v) {
    var plate = v.plate || '';
    if (plate) allPlates.add(plate);
  });

  // Créer un map plate -> nom pour l'affichage
  const plateToName = {};
  vehicles.forEach(function(v) {
    if (v.plate) plateToName[v.plate] = v.name || v.plate;
  });

  // Trier par nom
  const sortedPlates = Array.from(allPlates).sort(function(a, b) {
    var nameA = plateToName[a] || a;
    var nameB = plateToName[b] || b;
    return nameA.localeCompare(nameB);
  });

  sortedPlates.forEach(function(plate) {
    var name = plateToName[plate] || plate;
    options += '<option value="' + plate + '">' + name + ' (' + plate + ')</option>';
  });

  select.innerHTML = options;
}

// ── renderVehicleStats (orig. line 12045) ──
function renderVehicleStats() {
  const data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  const payments = data.payments || [];
  const rentals = data.rentals || [];
  const vehicles = data.vehicles || [];

  const selectedPlate = document.getElementById('vehicle-select') ? document.getElementById('vehicle-select').value : 'all';
  const monthFilterFrom = document.getElementById('vehicle-month-from') ? document.getElementById('vehicle-month-from').value : '';
  const monthFilterTo = document.getElementById('vehicle-month-to') ? document.getElementById('vehicle-month-to').value : '';

  console.log(`🔍 Vehicle Stats Filter: Plate=${selectedPlate}, From=${monthFilterFrom}, To=${monthFilterTo}`);

  // Helper: vérifie si une date (YYYY-MM-DD) est dans la plage de month
  function isDateInMonthRange(dateStr, fromMonth, toMonth) {
    if (!dateStr) return false;
    const monthKey = dateStr.substring(0, 7); // YYYY-MM
    if (fromMonth && monthKey < fromMonth) return false;
    if (toMonth && monthKey > toMonth) return false;
    return true;
  }

  // Normaliser la plaque selectede
  const normalizedSelected = selectedPlate !== 'all' ? normalizePlateGlobal(selectedPlate) : 'all';

  // Filtrer les rentals
  let filteredRentals = rentals.filter(function(r) {
    if (!r.dateOut) return false;
    
    // Filtre plaque
    if (normalizedSelected !== 'all') {
      const rentalPlate = normalizePlateGlobal(r._plate || r.plate || '');
      if (rentalPlate !== normalizedSelected) return false;
    }
    
    // Filtre month
    if (!isDateInMonthRange(r.dateOut, monthFilterFrom, monthFilterTo)) {
      return false;
    }
    
    return true;
  });

  // Filtrer les payments
  let filteredPayments = payments.filter(function(p) {
    const amount = parseFloat(p.amount || p.paid || p.price || 0);
    if (amount <= 0) return false;

    // Filtre plaque — CRITICAL FIX: resolve plate via vehicleId too
    if (normalizedSelected !== 'all') {
      // Build resolved plate using same logic as calculateVehicleStats
      let resolvedPlate = '';
      if (p._plate) resolvedPlate = String(p._plate).trim();
      else if (p.plate) resolvedPlate = String(p.plate).trim();
      else if (p.vehicleId && vehicles && vehicles.length > 0) {
        const vid = parseInt(p.vehicleId, 10);
        const vehicle = vehicles.find(function(v) { return v && v.id === vid; });
        if (vehicle && vehicle.plate) resolvedPlate = String(vehicle.plate).trim();
      }
      // Also try contract matching
      if (!resolvedPlate && p.contract && rentals && rentals.length > 0) {
        const contractStr = String(p.contract).trim();
        const matchingRental = rentals.find(function(r) {
          return r && String(r.contract).trim() === contractStr;
        });
        if (matchingRental) {
          if (matchingRental._plate) resolvedPlate = String(matchingRental._plate).trim();
          else if (matchingRental.plate) resolvedPlate = String(matchingRental.plate).trim();
        }
      }
      const paymentPlate = normalizePlateGlobal(resolvedPlate);
      if (paymentPlate !== normalizedSelected) return false;
    }

    // Filtre month
    const paymentDate = p.dateOut || p.date || p._date || '';
    if (!isDateInMonthRange(paymentDate, monthFilterFrom, monthFilterTo)) {
      return false;
    }

    return true;
  });

  console.log(`  Rentals filtrées: ${filteredRentals.length}, Payments filtrées: ${filteredPayments.length}`);

  // Info text
  const infoEl = document.getElementById('vehicle-filter-info');
  if (infoEl) {
    if (monthFilterFrom || monthFilterTo) {
      infoEl.textContent = translate('rev.filterLabel') + ': ' + (monthFilterFrom || translate('rev.start')) + ' ' + translate('rev.to') + ' ' + (monthFilterTo || translate('rev.now').toLowerCase()) + ' | ' + translate('rev.vehicleLabel') + ': ' + (selectedPlate === 'all' ? translate('rev.all') : selectedPlate);
    } else {
      infoEl.textContent = translate('rev.allPeriods') + ' | ' + translate('rev.vehicleLabel') + ': ' + (selectedPlate === 'all' ? translate('rev.all') : selectedPlate);
    }
  }

  const stats = calculateVehicleStats(filteredPayments, filteredRentals, vehicles, selectedPlate);

  // Summary cards
  const summaryEl = document.getElementById('vehicle-summary');
  if (summaryEl) {
    const avgPerContract = stats.totalContracts > 0 ? (stats.totalRevenue / stats.totalContracts).toFixed(2) : '0.00';
    summaryEl.innerHTML = 
      '<div class="stat-card green">' +
        '<div class="stat-label">' + translate('rev.totalRevenue') + '</div>' +
        '<div class="stat-val">' + stats.totalRevenue.toFixed(2) + ' <span style="font-size:.9rem">OMR</span></div>' +
        '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">' + stats.totalContracts + ' ' + translate('rev.contracts') + '</div>' +
      '</div>' +
      '<div class="stat-card blue">' +
        '<div class="stat-label">' + translate('rev.avgPerContract') + '</div>' +
        '<div class="stat-val">' + avgPerContract + ' <span style="font-size:.9rem">OMR</span></div>' +
      '</div>' +
      '<div class="stat-card purple">' +
        '<div class="stat-label">' + translate('rev.totalDaysRented') + '</div>' +
        '<div class="stat-val">' + stats.totalDays + '</div>' +
      '</div>' +
      '<div class="stat-card yellow">' +
        '<div class="stat-label">' + translate('rev.totalKmDriven') + '</div>' +
        '<div class="stat-val">' + stats.totalKm.toLocaleString() + ' <span style="font-size:.9rem">km</span></div>' +
      '</div>';
  }

  // Chart
  const chartEl = document.getElementById('vehicle-chart');
  if (chartEl) {
    const chartData = stats.vehicles.map(function(v) { 
      return { label: v.plate, value: v.revenue }; 
    }).sort(function(a, b) { return b.value - a.value; }).slice(0, 15);
    chartEl.innerHTML = createBarChart(chartData, translate('rev.revenueByVehicle'));
  }

  // Table
  const tbody = document.getElementById('vehicle-tbody');
  const tableCount = document.getElementById('vehicle-table-count');
  if (tableCount) tableCount.textContent = stats.vehicles.length + ' ' + translate('rev.vehicles') + ' • ' + translate('rev.total') + ': ' + stats.totalRevenue.toFixed(2) + ' OMR';

  let tableHTML = '';
  stats.vehicles.sort(function(a, b) { return b.revenue - a.revenue; }).forEach(function(v) {
    const methods = Object.entries(v.methods).map(function(e) { return e[0] + ': ' + e[1].toFixed(1); }).join(', ');
    tableHTML += '<tr style="cursor:pointer" data-app-action="open-vehicle-drilldown" data-plate="' + escapeHtml(v.plate) + '" data-label="' + escapeHtml(v.name) + '" title="' + (translate('rev.clickForDetails') || 'Click for contract details') + '">' +
      '<td><span class="badge badge-blue">' + escapeHtml(v.name) + '</span></td>' +
      '<td style="font-family:var(--mono);font-weight:700">' + escapeHtml(v.plate) + '</td>' +
      '<td>' + v.contracts + '</td>' +
      '<td style="color:var(--green);font-weight:700">' + v.revenue.toFixed(2) + ' OMR</td>' +
      '<td>' + (v.contracts > 0 ? (v.revenue / v.contracts).toFixed(2) : '0.00') + ' OMR</td>' +
      '<td>' + v.days + '</td>' +
      '<td>' + v.km.toLocaleString() + ' km</td>' +
      '<td style="font-size:.75rem;color:var(--muted)">' + (methods || translate('rev.na')) + '</td>' +
    '</tr>';
  });

  if (tbody) tbody.innerHTML = tableHTML || '<tr><td colspan="8" class="rev-empty">'+translate('rev.noDataMatchingFilter')+'</td></tr>';
}

// ── clearVehicleFilters (orig. line 12197) ──
function clearVehicleFilters() {
  document.getElementById('vehicle-month-from').value = '';
  document.getElementById('vehicle-month-to').value = '';
  document.getElementById('vehicle-select').value = 'all';
  renderVehicleStats();
}


// ── calculateVehicleStats (orig. line 12205) ──
function calculateVehicleStats(payments, rentals, vehicles, selectedPlate) {
  const result = {
    totalRevenue: 0,
    totalContracts: 0,
    totalDays: 0,
    totalKm: 0,
    vehicles: []
  };

  // Helper: get amount from payment
  function getAmount(p) {
    if (p.amount !== undefined && p.amount !== null && !isNaN(p.amount)) return parseFloat(p.amount);
    if (p.paid !== undefined && p.paid !== null && !isNaN(p.paid)) return parseFloat(p.paid);
    if (p.price !== undefined && p.price !== null && !isNaN(p.price)) return parseFloat(p.price);
    return 0;
  }

  // Helper: resolve plate from payment (CRITICAL FIX)
  // Tries _plate first, then plate, then resolves via vehicleId from vehicles array
  function resolvePlate(p) {
    if (p._plate && String(p._plate).trim()) return String(p._plate).trim();
    if (p.plate && String(p.plate).trim()) return String(p.plate).trim();
    if (p.vehicleId && vehicles && vehicles.length > 0) {
      const vid = parseInt(p.vehicleId, 10);
      const vehicle = vehicles.find(function(v) { return v && v.id === vid; });
      if (vehicle && vehicle.plate) return String(vehicle.plate).trim();
    }
    // Also try contract number matching against rentals
    if (p.contract && rentals && rentals.length > 0) {
      const contractStr = String(p.contract).trim();
      const matchingRental = rentals.find(function(r) {
        return r && String(r.contract).trim() === contractStr;
      });
      if (matchingRental) {
        if (matchingRental._plate) return String(matchingRental._plate).trim();
        if (matchingRental.plate) return String(matchingRental.plate).trim();
        if (matchingRental.vehicleId && vehicles && vehicles.length > 0) {
          const vid = parseInt(matchingRental.vehicleId, 10);
          const vehicle = vehicles.find(function(v) { return v && v.id === vid; });
          if (vehicle && vehicle.plate) return String(vehicle.plate).trim();
        }
      }
    }
    return '';
  }

  // Helper: get vehicle name from normalized plate
  // Priority: 1) DB.vehicles  2) DB.gpsLinks (GPS Tracking)  3) PLATE_VEHICLE_MAP
  function getVehicleName(normalizedPlate) {
    // 1 — DB.vehicles
    if (vehicles && vehicles.length) {
      const vehicle = vehicles.find(function(v) {
        return v && v.plate && normalizePlateGlobal(v.plate) === normalizedPlate;
      });
      if (vehicle && vehicle.name && vehicle.name !== "Unknown") return vehicle.name;
    }
    // 2 — DB.gpsLinks (GPS Tracking database)
    const gpsLinks = (typeof DB !== "undefined" && DB.gpsLinks) ? DB.gpsLinks : [];
    if (gpsLinks.length) {
      const gps = gpsLinks.find(function(g) {
        return g && g.plate && normalizePlateGlobal(g.plate) === normalizedPlate;
      });
      if (gps && gps.name && gps.name.trim()) return gps.name.trim();
    }
    // 3 — PLATE_VEHICLE_MAP static map
    if (typeof PLATE_VEHICLE_MAP !== "undefined") {
      const mapKeys = Object.keys(PLATE_VEHICLE_MAP);
      const matched = mapKeys.find(function(k) {
        return normalizePlateGlobal(k) === normalizedPlate;
      });
      if (matched) return PLATE_VEHICLE_MAP[matched];
    }
    return "Unknown";
  }

  // Helper: calculate days between two dates
  function calcDays(dateOut, dateIn) {
    if (!dateOut) return 0;
    const out = new Date(dateOut);
    const inn = dateIn ? new Date(dateIn) : new Date();
    if (isNaN(out.getTime())) return 0;
    if (isNaN(inn.getTime())) return 0;
    const diff = Math.ceil((inn - out) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }

  // Helper: calculate KM difference
  function calcKm(kmOut, kmIn) {
    const out = parseFloat(kmOut) || 0;
    const inn = parseFloat(kmIn) || 0;
    return inn > out ? inn - out : 0;
  }

  const vehicleMap = {};

  // ── STEP 1: Process RENTALS (for contracts, days, KM) ──
  rentals.forEach(function(r) {
    const rawPlate = resolvePlate(r);
    if (!rawPlate) return;

    const normalizedPlate = normalizePlateGlobal(rawPlate);

    if (selectedPlate !== 'all') {
      const normalizedSelected = normalizePlateGlobal(selectedPlate);
      if (normalizedPlate !== normalizedSelected) return;
    }

    if (!vehicleMap[normalizedPlate]) {
      vehicleMap[normalizedPlate] = {
        plate: normalizedPlate,
        name: getVehicleName(normalizedPlate),
        revenue: 0,
        contracts: 0,
        days: 0,
        km: 0,
        methods: {}
      };
    }

    // Revenue comes from payments (DB.payments) to avoid double counting
    vehicleMap[normalizedPlate].contracts++;
    vehicleMap[normalizedPlate].days += calcDays(r.dateOut, r.dateIn);
    vehicleMap[normalizedPlate].km += calcKm(r.kmOut, r.kmIn);

    result.totalContracts++;
    result.totalDays += calcDays(r.dateOut, r.dateIn);
    result.totalKm += calcKm(r.kmOut, r.kmIn);
  });

  // ── STEP 2: Process PAYMENTS (CRITICAL FIX: ALL payments are now summed) ──
  payments.forEach(function(p) {
    const rawPlate = resolvePlate(p);
    if (!rawPlate) return;

    const normalizedPlate = normalizePlateGlobal(rawPlate);

    if (selectedPlate !== 'all') {
      const normalizedSelected = normalizePlateGlobal(selectedPlate);
      if (normalizedPlate !== normalizedSelected) return;
    }

    const amount = getAmount(p);
    if (amount <= 0) return;

    if (!vehicleMap[normalizedPlate]) {
      vehicleMap[normalizedPlate] = {
        plate: normalizedPlate,
        name: getVehicleName(normalizedPlate),
        revenue: 0,
        contracts: 0,
        days: 0,
        km: 0,
        methods: {}
      };
    }

    // ✅ CRITICAL FIX: ALL payments for the same vehicle are now CORRECTLY SUMMED
    vehicleMap[normalizedPlate].revenue += amount;
    result.totalRevenue += amount;

    // Track payment methods
    const method = (p.paymentMethod || p.method || 'UNKNOWN').toUpperCase();
    if (!vehicleMap[normalizedPlate].methods[method]) {
      vehicleMap[normalizedPlate].methods[method] = 0;
    }
    vehicleMap[normalizedPlate].methods[method] += amount;
  });

  // Convert map to array and sort by revenue descending
  result.vehicles = Object.values(vehicleMap).sort(function(a, b) {
    return b.revenue - a.revenue;
  });

  return result;
}

/* ═══════════════════════════════════════════════════════════
   FILTRES PAR MONTH / PLAGE POUR REVENUE STATS
   ═══════════════════════════════════════════════════════════ */

// filterRentalsByMonth(), filterPaymentsByMonth() et filterPaymentsByDateRange()
// supprimées (2026-08) — audit du 2026-08 : ces 3 fonctions étaient définies
// mais jamais appelées nulle part dans l'app (code mort). Si un usage réel
// est nécessaire un jour, utiliser filterByMonth(list, dateFields, monthStr)
// ou filterByDateRange(list, dateField, from, to) (core.js).

// filterPaymentsByMonthRange(), filterRentalsByMonthRange() et
// filterDepenceByMonthRange() supprimées (2026-08) — les 3 faisaient
// exactement la même comparaison année/mois, une fois par type d'entité.
// Remplacées par filterByMonthRange(list, dateFields, monthFrom, monthTo)
// (core.js), partagée avec module-depence.js.
function filterPaymentsByMonthRange(payments, monthFrom, monthTo) {
  return filterByMonthRange(payments, ['date', '_date'], monthFrom, monthTo);
}
function filterRentalsByMonthRange(rentals, monthFrom, monthTo) {
  return filterByMonthRange(rentals, ['dateOut', '_dateOut', 'out'], monthFrom, monthTo);
}
function filterDepenceByMonthRange(depence, monthFrom, monthTo) {
  return filterByMonthRange(depence, ['date'], monthFrom, monthTo);
}

/* ═══════════════════════════════════════════════════════════
   PROFIT — Revenu (payments/rentals) − Dépenses (DB.depence)
   Croisement UNIQUEMENT par plaque normalisée (normalizePlateGlobal),
   la même clé que celle utilisée par calculateVehicleStats() pour les
   revenus. Ça garantit qu'une dépense et un paiement liés à la même
   voiture tombent toujours sur la même clé, peu importe si l'un a été
   saisi via vehicleId et l'autre via une plaque brute mal formatée.
   ═══════════════════════════════════════════════════════════ */

// calculateExpenseStats() supprimée (2026-08) — identique dans son principe à
// l'ex-depCalculateStats() de module-depence.js (les deux parcouraient
// DB.depence pour construire les mêmes buckets daily/monthly/yearly).
// Remplacée par calculateDepenceStats() (core.js), qui calcule EN UNE SEULE
// PASSE le détail cash/cheque (utilisé par Dépense) ET vehicle/general
// (utilisé ici) — même total, un seul endroit à corriger en cas de bug.
// vehicleTotal/generalTotal (utilisés par le reste de ce fichier) restent
// disponibles ci-dessous via stats.vehicleAmount/generalAmount par bucket ;
// on reconstruit ici les totaux globaux attendus par les appelants existants.
function calculateExpenseStats(depence) {
  const stats = calculateDepenceStats(depence);
  stats.vehicleTotal = 0;
  stats.generalTotal = 0;
  (depence || []).forEach(function(e) {
    const amount = parseFloat(e.amount) || 0;
    if (amount <= 0 || !e.date) return;
    if (e.kind === 'vehicle' && e.vehicleId) stats.vehicleTotal += amount;
    else stats.generalTotal += amount;
  });
  return stats;
}

// calculateExpensesByPlate() — dépenses véhicule regroupées par plaque normalisée.
// Les dépenses générales (sans vehicleId, ou vehicleId orphelin) sont comptées à
// part (generalTotal) et JAMAIS attribuées à une voiture précise.
// (2026-08) : cette logique est maintenant dans groupDepenceByPlate() (core.js) ;
// gardée ici comme fine wrapper pour ne rien casser des appelants existants
// (calculateProfitByPlate, calculateRoiStats plus bas dans ce fichier).
function calculateExpensesByPlate(depence, vehicles) {
  return groupDepenceByPlate(depence, vehicles);
}

// ── calculateExpenseCategoriesForPlate — répartition par catégorie des dépenses
// d'UN véhicule (par plaque normalisée), optionnellement filtrée sur une plage
// de dates [dateFrom, dateTo] (format YYYY-MM-DD). Utilisée par le drill-down
// (Vehicle / Category / ROI tabs) pour répondre à "pourquoi ce véhicule coûte cher". ──
function calculateExpenseCategoriesForPlate(depence, vehicles, plate, dateFrom, dateTo) {
  const normalizedPlate = normalizePlateGlobal(plate || '');
  const map = {};
  let total = 0;

  (depence || []).forEach(function (e) {
    const amount = parseFloat(e.amount) || 0;
    if (amount <= 0) return;
    if (e.kind !== 'vehicle' || !e.vehicleId) return;

    const vehicle = (vehicles || []).find(function (v) { return v && v.id === Number(e.vehicleId); });
    const rawPlate = vehicle && vehicle.plate ? vehicle.plate : '';
    if (!rawPlate || normalizePlateGlobal(rawPlate) !== normalizedPlate) return;

    const date = normalizeDate(e.date || '');
    if (dateFrom && (!date || date < dateFrom)) return;
    if (dateTo && (!date || date > dateTo)) return;

    const cat = e.category || '—';
    map[cat] = (map[cat] || 0) + amount;
    total += amount;
  });

  const categories = Object.keys(map).map(function (c) { return { category: c, amount: map[c] }; })
    .sort(function (a, b) { return b.amount - a.amount; });

  return { categories: categories, total: total };
}

// ── calculateProfitTrend — fusionne revenu/dépenses mois par mois et année par année ──
function calculateProfitTrend(revenueStats, expenseStats) {
  const trend = { monthly: {}, yearly: {} };

  const monthKeys = new Set([].concat(Object.keys(revenueStats.monthly || {}), Object.keys(expenseStats.monthly || {})));
  monthKeys.forEach(function(k) {
    const revenue = (revenueStats.monthly[k] && revenueStats.monthly[k].amount) || 0;
    const expenses = (expenseStats.monthly[k] && expenseStats.monthly[k].amount) || 0;
    trend.monthly[k] = { revenue: revenue, expenses: expenses, profit: revenue - expenses };
  });

  const yearKeys = new Set([].concat(Object.keys(revenueStats.yearly || {}), Object.keys(expenseStats.yearly || {})));
  yearKeys.forEach(function(k) {
    const revenue = (revenueStats.yearly[k] && revenueStats.yearly[k].amount) || 0;
    const expenses = (expenseStats.yearly[k] && expenseStats.yearly[k].amount) || 0;
    trend.yearly[k] = { revenue: revenue, expenses: expenses, profit: revenue - expenses };
  });

  return trend;
}

// ── calculateProfitByPlate — fusionne revenu par plaque (calculateVehicleStats) et
// dépenses par plaque (calculateExpensesByPlate), sur la clé normalizedPlate ──
function calculateProfitByPlate(payments, rentals, depence, vehicles) {
  const revenueStats = calculateVehicleStats(payments, rentals, vehicles, 'all');
  const expenseData = calculateExpensesByPlate(depence, vehicles);

  const merged = {};

  revenueStats.vehicles.forEach(function(v) {
    merged[v.plate] = {
      plate: v.plate,
      name: v.name,
      revenue: v.revenue,
      expenses: 0,
      contracts: v.contracts
    };
  });

  Object.keys(expenseData.byPlate).forEach(function(plate) {
    const exp = expenseData.byPlate[plate];
    if (!merged[plate]) {
      merged[plate] = { plate: plate, name: exp.name, revenue: 0, expenses: 0, contracts: 0 };
    }
    merged[plate].expenses = exp.expenses;
  });

  const list = Object.values(merged).map(function(v) {
    const profit = v.revenue - v.expenses;
    const margin = v.revenue > 0 ? (profit / v.revenue) * 100 : (v.expenses > 0 ? -100 : 0);
    return Object.assign({}, v, { profit: profit, margin: margin });
  }).sort(function(a, b) { return b.profit - a.profit; });

  return {
    vehicles: list,
    totalRevenue: revenueStats.totalRevenue,
    totalVehicleExpenses: expenseData.vehicleTotal,
    totalGeneralExpenses: expenseData.generalTotal
  };
}

// ── ownershipYearsFromDate — durée de possession en années (décimal), depuis
// purchaseDate jusqu'à aujourd'hui. Retourne null si purchaseDate absente/invalide
// ou si elle est dans le futur, pour ne jamais annualiser sur une base fausse. ──
function ownershipYearsFromDate(purchaseDate) {
  const d = normalizeDate(purchaseDate || '');
  if (!d) return null;
  const start = new Date(d + 'T00:00:00');
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  const years = (now - start) / (365.25 * 24 * 3600 * 1000);
  if (years <= 0) return null;
  // moins d'un mois de recul : trop tôt pour annualiser de façon fiable
  return years >= (1 / 12) ? years : null;
}

// ── calculateRoiStats — ROI par véhicule : prix d'achat, date d'achat (saisis
// manuellement dans Depence > Achat) vs revenu total (all-time) et dépenses
// totales (all-time). netReturn = revenue - totalCost.
// (2026-08) : resalePrice (valeur de revente) supprimée ENTIÈREMENT — n'entrait
// plus dans le calcul (1er correctif) puis le champ de saisie lui-même a été
// retiré de Depence > Achat sur demande explicite (inclure la revente gonflait
// artificiellement le ROI d'un véhicule vendu vs un véhicule encore en flotte,
// rendant les deux non comparables). roiAnnualPct annualisé aux années de
// possession pour comparer des véhicules achetés à des dates différentes. ──
function calculateRoiStats() {
  const data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  const payments = data.payments || [];
  const rentals = data.rentals || [];
  const vehicles = data.vehicles || [];
  const depence = data.depence || [];

  const revenueStats = calculateVehicleStats(payments, rentals, vehicles, 'all');
  const expenseData = calculateExpensesByPlate(depence, vehicles);

  const revByPlate = {};
  revenueStats.vehicles.forEach(function (v) { revByPlate[v.plate] = v; });

  const rows = (vehicles || []).map(function (v) {
    const plate = normalizePlateGlobal(v.plate || '');
    const purchasePrice = Number(v.purchasePrice || 0);
    const purchaseDate = v.purchaseDate || '';
    const revenue = (revByPlate[plate] && revByPlate[plate].revenue) || 0;
    const expenses = (expenseData.byPlate[plate] && expenseData.byPlate[plate].expenses) || 0;
    const totalCost = purchasePrice + expenses;
    const netReturn = revenue - totalCost;
    const roiPct = totalCost > 0 ? (netReturn / totalCost) * 100 : (revenue > 0 ? 100 : 0);
    const ownershipYears = ownershipYearsFromDate(purchaseDate);
    const roiAnnualPct = ownershipYears ? (roiPct / ownershipYears) : null;
    return {
      plate: plate, name: v.name || plate, purchasePrice: purchasePrice,
      purchaseDate: purchaseDate,
      revenue: revenue, expenses: expenses, totalCost: totalCost,
      netReturn: netReturn, roiPct: roiPct,
      ownershipYears: ownershipYears, roiAnnualPct: roiAnnualPct
    };
  }).sort(function (a, b) {
    // Trie par ROI annualisé quand dispo des deux côtés (mesure la plus comparable
    // entre véhicules achetés à des dates différentes) ; sinon retombe sur le ROI brut.
    const aKey = (a.roiAnnualPct !== null && b.roiAnnualPct !== null) ? a.roiAnnualPct : a.roiPct;
    const bKey = (a.roiAnnualPct !== null && b.roiAnnualPct !== null) ? b.roiAnnualPct : b.roiPct;
    return bKey - aKey;
  });

  const totals = rows.reduce(function (s, r) {
    s.purchasePrice += r.purchasePrice; s.revenue += r.revenue; s.expenses += r.expenses;
    s.totalCost += r.totalCost; s.netReturn += r.netReturn; return s;
  }, { purchasePrice: 0, revenue: 0, expenses: 0, totalCost: 0, netReturn: 0 });
  totals.roiPct = totals.totalCost > 0 ? (totals.netReturn / totals.totalCost) * 100 : 0;

  return { vehicles: rows, totals: totals };
}

var g_lastRoiStats = null;

// ── renderRoiStats — orchestrates the ROI tab ──
function renderRoiStats() {
  const stats = calculateRoiStats();
  g_lastRoiStats = stats;

  const summaryEl = document.getElementById('roi-summary');
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div class="stat-card blue"><div class="stat-label">' + (translate('rev.totalPurchaseCost') || 'Total Purchase Cost') + '</div><div class="stat-val">' + fmtNum(stats.totals.purchasePrice) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card green"><div class="stat-label">' + (translate('rev.lifetimeRevenue') || 'Lifetime Revenue') + '</div><div class="stat-val">' + fmtNum(stats.totals.revenue) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card red"><div class="stat-label">' + (translate('rev.lifetimeExpenses') || 'Lifetime Expenses') + '</div><div class="stat-val">' + fmtNum(stats.totals.expenses) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card ' + (stats.totals.netReturn >= 0 ? 'blue' : 'red') + '"><div class="stat-label">' + (translate('rev.netReturn') || 'Net Return') + '</div><div class="stat-val" style="color:' + (stats.totals.netReturn >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmtNum(stats.totals.netReturn) + ' <span style="font-size:.9rem">OMR</span></div></div>' +
      '<div class="stat-card purple"><div class="stat-label">' + (translate('rev.fleetRoi') || 'Fleet ROI') + '</div><div class="stat-val">' + stats.totals.roiPct.toFixed(1) + ' <span style="font-size:.9rem">%</span></div></div>';
  }

  const tbody = document.getElementById('roi-tbody');
  let html = '';
  stats.vehicles.forEach(function (v) {
    const roiColor = v.roiPct >= 0 ? 'var(--green)' : 'var(--red)';
    const noPurchase = v.purchasePrice <= 0;
    const annualColor = (v.roiAnnualPct !== null && v.roiAnnualPct >= 0) ? 'var(--green)' : 'var(--red)';
    html += '<tr style="cursor:pointer" data-app-action="open-vehicle-drilldown" data-plate="' + escapeHtml(v.plate) + '" data-label="' + escapeHtml(v.name) + '" title="' + (translate('rev.clickForDetails') || 'Click for contract details') + '">' +
      '<td><span class="badge badge-blue">' + escapeHtml(v.name) + '</span></td>' +
      '<td style="font-family:var(--mono);font-weight:700">' + escapeHtml(v.plate) + '</td>' +
      '<td>' + (noPurchase ? '<span style="color:var(--muted);font-style:italic">' + (translate('rev.noPurchasePrice') || 'not set') + '</span>' : fmtNum(v.purchasePrice) + ' OMR') + '</td>' +
      '<td>' + (v.purchaseDate ? escapeHtml(v.purchaseDate) : '<span style="color:var(--muted);font-style:italic">' + (translate('rev.noPurchaseDate') || 'not set') + '</span>') + '</td>' +
      '<td>' + (v.ownershipYears !== null ? v.ownershipYears.toFixed(1) + ' ' + (translate('rev.years') || 'years') : '—') + '</td>' +
      '<td style="color:var(--green)">' + fmtNum(v.revenue) + ' OMR</td>' +
      '<td style="color:var(--red)">' + fmtNum(v.expenses) + ' OMR</td>' +
      '<td style="font-weight:700">' + fmtNum(v.totalCost) + ' OMR</td>' +
      '<td style="font-weight:700;color:' + roiColor + '">' + fmtNum(v.netReturn) + ' OMR</td>' +
      '<td style="font-weight:800;color:' + roiColor + '">' + (noPurchase ? '—' : v.roiPct.toFixed(1) + ' %') + '</td>' +
      '<td style="font-weight:800;color:' + annualColor + '">' + (v.roiAnnualPct !== null ? v.roiAnnualPct.toFixed(1) + ' %' : '—') + '</td>' +
    '</tr>';
  });
  if (tbody) tbody.innerHTML = html || '<tr><td colspan="10" class="rev-empty">' + translate('rev.noDataMatchingFilter') + '</td></tr>';

  const countEl = document.getElementById('roi-table-count');
  if (countEl) countEl.textContent = stats.vehicles.length + ' ' + translate('rev.vehicles');
}
window.renderRoiStats = renderRoiStats;

// ── exportRoiCSV — raw export for Excel ──
function exportRoiCSV() {
  if (!g_lastRoiStats) return;
  var rows = [['Vehicle', 'Plate', 'Purchase Price (OMR)', 'Purchase Date', 'Ownership (years)', 'Lifetime Revenue (OMR)', 'Lifetime Expenses (OMR)', 'Total Cost (OMR)', 'Net Return (OMR)', 'ROI (%)', 'Annualized ROI (%)']];
  g_lastRoiStats.vehicles.forEach(function (v) {
    rows.push([
      v.name, v.plate, v.purchasePrice.toFixed(2), v.purchaseDate || '',
      v.ownershipYears !== null ? v.ownershipYears.toFixed(2) : '',
      v.revenue.toFixed(2), v.expenses.toFixed(2),
      v.totalCost.toFixed(2), v.netReturn.toFixed(2), v.roiPct.toFixed(1),
      v.roiAnnualPct !== null ? v.roiAnnualPct.toFixed(1) : ''
    ]);
  });
  rows.push([]);
  rows.push(['TOTAL', '', g_lastRoiStats.totals.purchasePrice.toFixed(2), '', '', g_lastRoiStats.totals.revenue.toFixed(2), g_lastRoiStats.totals.expenses.toFixed(2), g_lastRoiStats.totals.totalCost.toFixed(2), g_lastRoiStats.totals.netReturn.toFixed(2), g_lastRoiStats.totals.roiPct.toFixed(1), '']);

  var csv = rows.map(function (r) {
    return r.map(function (cell) {
      var s = String(cell === undefined || cell === null ? '' : cell);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');

  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'vehicle-roi_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.exportRoiCSV = exportRoiCSV;

/* ═══════════════════════════════════════════════════════════
   DRILL-DOWN — click a vehicle row (Vehicle / Category / ROI tabs)
   to see the underlying contracts that make up its numbers.
   ═══════════════════════════════════════════════════════════ */
function openVehicleDrilldown(plate, dateFrom, dateTo, label) {
  const data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  const rentals = data.rentals || [];
  const vehicles = data.vehicles || [];
  const normalizedPlate = normalizePlateGlobal(plate);

  // Same robust plate resolution as calculateVehicleStats/calculateCategoryStats:
  // try r._plate, then r.plate, then fall back to r.vehicleId → DB.vehicles lookup
  // (many older rental records only carry vehicleId, not a plate field).
  function resolveRentalPlate(r) {
    if (r._plate && String(r._plate).trim()) return String(r._plate).trim();
    if (r.plate && String(r.plate).trim()) return String(r.plate).trim();
    if (r.vehicleId && vehicles.length) {
      const vid = parseInt(r.vehicleId, 10);
      const vehicle = vehicles.find(function (v) { return v && v.id === vid; });
      if (vehicle && vehicle.plate) return String(vehicle.plate).trim();
    }
    return '';
  }

  const matches = rentals.filter(function (r) {
    const rawPlate = resolveRentalPlate(r);
    if (!rawPlate || normalizePlateGlobal(rawPlate) !== normalizedPlate) return false;
    if (!r.dateOut) return false;
    const d = normalizeDate(r.dateOut);
    if (dateFrom && (!d || d < dateFrom)) return false;
    if (dateTo && (!d || d > dateTo)) return false;
    return true;
  }).sort(function (a, b) { return String(b.dateOut).localeCompare(String(a.dateOut)); });

  const titleEl = document.getElementById('modal-drilldown-title');
  if (titleEl) titleEl.textContent = '🔍 ' + (label ? label + ' — ' : '') + plate + ' — ' + (translate('rev.drilldownTitle') || 'Contracts');

  const subEl = document.getElementById('modal-drilldown-sub');
  if (subEl) {
    subEl.textContent = matches.length + ' ' + translate('rev.contracts') +
      (dateFrom || dateTo ? ' (' + (dateFrom || '…') + ' → ' + (dateTo || '…') + ')' : '');
  }

  let html = '';
  matches.forEach(function (r) {
    const isOpen = !r.dateIn;
    const paid = getRentalPaidTotal(r);
    html += '<tr>' +
      '<td style="font-family:var(--mono);font-weight:700">' + escapeHtml(String(r.contract || '—')) + '</td>' +
      '<td>' + escapeHtml(String(r.dateOut || '').substring(0, 10)) + '</td>' +
      '<td>' + (isOpen ? '<span style="color:var(--yellow,#d97706);font-weight:700">' + (translate('rev.openContract') || 'Open') + '</span>' : escapeHtml(String(r.dateIn).substring(0, 10))) + '</td>' +
      '<td style="font-weight:700;color:var(--green)">' + fmtNum(paid) + ' OMR</td>' +
    '</tr>';
  });

  const tbody = document.getElementById('modal-drilldown-tbody');
  if (tbody) tbody.innerHTML = html || '<tr><td colspan="4" class="rev-empty">' + translate('rev.noDataMatchingFilter') + '</td></tr>';

  // ── Expense breakdown by category — answers "why does this vehicle cost so much",
  // same date range as the contracts above (all-time when opened from the ROI tab). ──
  const expEl = document.getElementById('modal-drilldown-expenses');
  if (expEl) {
    const depence = data.depence || [];
    const catStats = calculateExpenseCategoriesForPlate(depence, vehicles, plate, dateFrom, dateTo);
    if (!catStats.categories.length) {
      expEl.innerHTML = '<div style="font-size:.72rem;color:var(--muted);text-align:center;padding:10px">' + (translate('rev.noExpensesInRange') || 'No expenses in this range') + '</div>';
    } else {
      let catHtml = '<div style="font-size:.75rem;font-weight:700;color:var(--muted);margin:14px 0 8px">📊 ' + (translate('rev.expensesByCategory') || 'Expenses by category') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px">';
      catStats.categories.forEach(function (c) {
        const pct = catStats.total > 0 ? (c.amount / catStats.total * 100) : 0;
        const color = (typeof depTypeColor === 'function') ? depTypeColor(c.category) : 'var(--red)';
        catHtml += '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="width:9px;height:9px;border-radius:999px;flex-shrink:0;background:' + color + '"></div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;justify-content:space-between;font-size:.76rem">' +
              '<span style="font-weight:700">' + escapeHtml(c.category) + '</span>' +
              '<span style="font-weight:800">' + fmtNum(c.amount) + ' OMR</span>' +
            '</div>' +
            '<div style="height:5px;border-radius:999px;background:var(--border);margin-top:4px;overflow:hidden"><div style="height:100%;background:' + color + ';width:' + pct + '%"></div></div>' +
          '</div>' +
          '<span style="font-size:.68rem;opacity:.6;width:34px;text-align:right">' + pct.toFixed(0) + '%</span>' +
        '</div>';
      });
      catHtml += '</div>';
      expEl.innerHTML = catHtml;
    }
  }

  if (typeof openModal === 'function') openModal('modal-drilldown');
}
window.openVehicleDrilldown = openVehicleDrilldown;

// ── createProfitBarChart — comme createBarChart, mais gère les valeurs négatives
// (perte) autour d'une ligne de base à zéro. Vert = profit, rouge = perte. ──
function createProfitBarChart(data, title) {
  if (!data || data.length === 0) return '<div style="text-align:center;color:var(--muted);padding:40px">' + translate('rev.noDataAvailable') + '</div>';

  const values = data.map(function(d) { return d.value || 0; });
  const maxAbs = Math.max.apply(Math, values.map(Math.abs).concat([1]));
  const halfHeight = 110; // hauteur au-dessus ET en-dessous de la ligne zéro
  const barWidth = Math.max(30, Math.min(60, 800 / data.length));

  let html = '<div style="margin-bottom:8px;font-weight:700;color:var(--muted);font-size:.85rem">' + title + '</div>';
  html += '<div style="display:flex;align-items:stretch;gap:8px;height:' + (halfHeight * 2 + 34) + 'px;overflow-x:auto;padding-bottom:4px">';

  data.forEach(function(item) {
    const val = item.value || 0;
    const pct = Math.min(Math.abs(val) / maxAbs, 1);
    const barHeight = Math.max(pct * halfHeight, 2);
    const isPos = val >= 0;
    const color = isPos ? 'var(--green)' : 'var(--red)';

    html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;min-width:' + barWidth + 'px;flex-shrink:0;height:' + (halfHeight * 2 + 34) + 'px">';
    // valeur + barre positive (au-dessus de la ligne zéro)
    html += '<div style="height:' + halfHeight + 'px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center">';
    if (isPos) {
      html += '<div style="font-size:.68rem;font-weight:700;color:var(--text);white-space:nowrap">' + fmtNum(val) + '</div>';
      html += '<div style="width:' + barWidth + 'px;height:' + barHeight + 'px;background:' + color + ';border-radius:4px 4px 0 0;transition:height .3s;min-height:2px"></div>';
    }
    html += '</div>';
    // ligne zéro
    html += '<div style="width:100%;height:2px;background:var(--border)"></div>';
    // barre négative (en-dessous de la ligne zéro)
    html += '<div style="height:' + halfHeight + 'px;display:flex;flex-direction:column;justify-content:flex-start;align-items:center">';
    if (!isPos) {
      html += '<div style="width:' + barWidth + 'px;height:' + barHeight + 'px;background:' + color + ';border-radius:0 0 4px 4px;transition:height .3s;min-height:2px"></div>';
      html += '<div style="font-size:.68rem;font-weight:700;color:var(--text);white-space:nowrap">' + fmtNum(val) + '</div>';
    }
    html += '</div>';
    html += '<div style="font-size:.65rem;color:var(--muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;margin-top:2px">' + item.label + '</div>';
    html += '</div>';
  });

  html += '</div>';
  return html;
}

// ── clearProfitFilters ──
function clearProfitFilters() {
  const from = document.getElementById('profit-month-from');
  const to = document.getElementById('profit-month-to');
  if (from) from.value = '';
  if (to) to.value = '';
  renderProfitStats();
}

// ── renderProfitStats — orchestrateur de l'onglet Profit ──
function renderProfitStats() {
  ensurePageLoaded('revenue-stats');
  const data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  const payments = data.payments || [];
  const rentals = data.rentals || [];
  const vehicles = data.vehicles || [];
  const depence = data.depence || [];

  const monthFrom = document.getElementById('profit-month-from') ? document.getElementById('profit-month-from').value : '';
  const monthTo = document.getElementById('profit-month-to') ? document.getElementById('profit-month-to').value : '';

  // ── Info texte de la plage sélectionnée ──
  const infoEl = document.getElementById('profit-filter-info');
  if (infoEl) {
    infoEl.textContent = (monthFrom || monthTo)
      ? (translate('rev.filterLabel') + ': ' + (monthFrom || translate('rev.start')) + ' ' + translate('rev.to') + ' ' + (monthTo || translate('rev.now').toLowerCase()))
      : translate('rev.allPeriods');
  }

  // ── 1) TENDANCE mensuelle/annuelle — toujours sur TOUT l'historique, pas filtrée ──
  const revenueStatsAll = calculateRevenueStats(payments, rentals);
  const expenseStatsAll = calculateExpenseStats(depence);
  const trend = calculateProfitTrend(revenueStatsAll, expenseStatsAll);

  const monthlyKeysSorted = Object.keys(trend.monthly).sort();
  const chartMonthly = monthlyKeysSorted.slice(-18).map(function(k) {
    return { label: k, value: trend.monthly[k].profit };
  });
  const chartEl = document.getElementById('profit-monthly-chart');
  if (chartEl) chartEl.innerHTML = createProfitBarChart(chartMonthly, translate('rev.profitByMonth') || 'Profit by month');

  const yearlyKeysSorted = Object.keys(trend.yearly).sort();
  let yearlyHTML = '';
  yearlyKeysSorted.forEach(function(y) {
    const t = trend.yearly[y];
    const margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
    const profitColor = t.profit >= 0 ? 'var(--green)' : 'var(--red)';
    yearlyHTML += '<tr>' +
      '<td style="font-weight:700">' + y + '</td>' +
      '<td style="color:var(--green)">' + fmtNum(t.revenue) + ' OMR</td>' +
      '<td style="color:var(--red)">' + fmtNum(t.expenses) + ' OMR</td>' +
      '<td style="color:' + profitColor + ';font-weight:700">' + fmtNum(t.profit) + ' OMR</td>' +
      '<td style="color:' + profitColor + '">' + margin.toFixed(1) + '%</td>' +
    '</tr>';
  });
  const yearlyTbody = document.getElementById('profit-yearly-tbody');
  if (yearlyTbody) yearlyTbody.innerHTML = yearlyHTML || '<tr><td colspan="5" class="rev-empty">' + translate('rev.noDataAvailable') + '</td></tr>';
  const yearlyCountEl = document.getElementById('profit-yearly-table-count');
  if (yearlyCountEl) yearlyCountEl.textContent = yearlyKeysSorted.length + ' ' + (translate('rev.years') || 'years');

  // ── 2) KPI + tableau PAR PLAQUE — filtrés sur la période sélectionnée ──
  const filteredPayments = filterPaymentsByMonthRange(payments, monthFrom, monthTo);
  const filteredRentals = filterRentalsByMonthRange(rentals, monthFrom, monthTo);
  const filteredDepence = filterDepenceByMonthRange(depence, monthFrom, monthTo);

  const profitData = calculateProfitByPlate(filteredPayments, filteredRentals, filteredDepence, vehicles);
  const totalExpenses = profitData.totalVehicleExpenses + profitData.totalGeneralExpenses;
  const netProfit = profitData.totalRevenue - totalExpenses;
  const margin = profitData.totalRevenue > 0 ? (netProfit / profitData.totalRevenue) * 100 : 0;

  // Résumé Revenue/Expenses/Net Profit/Margin retiré d'ici (2026-08) — c'est
  // exactement ce que montre déjà l'onglet Overview (mêmes 4 chiffres, même
  // calculateProfitByPlate). Le Profit tab garde ce qui lui est propre :
  // la tendance mensuelle/annuelle et le détail par véhicule ci-dessous.
  const summaryEl = document.getElementById('profit-summary');
  if (summaryEl) {
    summaryEl.innerHTML = '<div style="grid-column:1/-1;font-size:.8rem;color:var(--muted);padding:4px 2px">' +
      (translate('rev.seeOverviewForTotals') || 'Revenue / Expenses / Net Profit / Margin totals: see the') + ' <a href="#" onclick="switchRevenueTab(\'overview\');return false;" style="color:var(--purple);font-weight:600">' + (translate('ov.overviewTab') || 'Overview') + '</a> ' + (translate('rev.tab') || 'tab') + '.</div>';
  }

  const plateTbody = document.getElementById('profit-plate-tbody');
  const plateCountEl = document.getElementById('profit-plate-table-count');
  if (plateCountEl) plateCountEl.textContent = profitData.vehicles.length + ' ' + (translate('rev.vehicles') || 'vehicles');

  let plateHTML = '';
  profitData.vehicles.forEach(function(v) {
    const profitColor = v.profit >= 0 ? 'var(--green)' : 'var(--red)';
    plateHTML += '<tr>' +
      '<td><span class="badge badge-blue">' + escapeHtml(v.name) + '</span></td>' +
      '<td style="font-family:var(--mono);font-weight:700">' + escapeHtml(v.plate) + '</td>' +
      '<td style="color:var(--green)">' + fmtNum(v.revenue) + ' OMR</td>' +
      '<td style="color:var(--red)">' + fmtNum(v.expenses) + ' OMR</td>' +
      '<td style="color:' + profitColor + ';font-weight:700">' + fmtNum(v.profit) + ' OMR</td>' +
      '<td style="color:' + profitColor + '">' + v.margin.toFixed(1) + '%</td>' +
    '</tr>';
  });
  if (plateTbody) plateTbody.innerHTML = plateHTML || '<tr><td colspan="6" class="rev-empty">' + translate('rev.noDataMatchingFilter') + '</td></tr>';
}
window.renderProfitStats = renderProfitStats;
window.clearProfitFilters = clearProfitFilters;

/* ═══════════════════════════════════════════════════════════
   REVENUE BY CATEGORY — Petrol / Extra KM / Extra Time / Car Wash / Rent
   ═══════════════════════════════════════════════════════════
   BUSINESS RULE (discount / partial payment):
   The amount ACTUALLY PAID on a contract is allocated IN PRIORITY to
   "Rent", up to its calculated price for that contract. Whatever is left
   over is then allocated to the variable charges — Petrol, Extra KM,
   Extra Time, Car Wash — in that order, each up to its own calculated
   price for that contract.
   This rule applies the SAME way:
     • to a contract paid IN FULL → Rent is taken in full first, then the
       4 variable items are taken in full from what remains.
     • to a contract with a DISCOUNT / partial payment → Rent is taken in
       priority up to whatever was paid; if nothing is left after
       covering Rent, the 4 variable items = 0 for that contract.
   For a contract still OPEN (vehicle not yet returned), none of these
   items are yet determined (they are only calculated when the vehicle
   comes back): everything paid is provisionally counted as "Rent".
   ═══════════════════════════════════════════════════════════ */

var g_categoryFilters = { petrol: true, extraKm: true, extraTime: true, carwash: true, rent: true };
var g_lastCategoryStats = null;

var CATEGORY_COLORS = { petrol: '#f97316', extraKm: '#a78bfa', extraTime: '#38bdf8', carwash: '#06b6d4', rent: 'var(--green)' };
var CATEGORY_LABELS_FALLBACK = { petrol: 'Petrol', extraKm: 'Extra KM', extraTime: 'Extra Time', carwash: 'Car Wash', rent: 'Rent' };

function categoryLabel(key) {
  var t = translate('rev.' + key);
  return (t && t !== 'rev.' + key) ? t : CATEGORY_LABELS_FALLBACK[key];
}

// ── calcCategoryDueAmounts — calculated price of each item (Rent + variables) for a CLOSED contract ──
// (same logic as calcBAL() in module-daily-rentals.js, split out item by item)
function calcCategoryDueAmounts(r) {
  if (!r || !r.dateOut || !r.dateIn) return { rent: 0, petrol: 0, extraKm: 0, extraTime: 0, carwash: 0 };
  try {
    var out = new Date(r.dateOut);
    var inD = new Date(r.dateIn);
    if (isNaN(out.getTime()) || isNaN(inD.getTime())) return { rent: 0, petrol: 0, extraKm: 0, extraTime: 0, carwash: 0 };

    var outMin = out.getHours() * 60 + out.getMinutes();
    var inMin = inD.getHours() * 60 + inD.getMinutes();
    var diffMin = inMin - outMin;
    var extraH = diffMin > 0 ? Math.floor(diffMin / 60) : 0;

    var dct = (typeof detectContractType === 'function') ? detectContractType(r) : { is4x4: false, durationType: 'daily' };
    var is4x4 = dct.is4x4, durationType = dct.durationType;
    var _defRate = is4x4 ? 0.100 : 0.050;
    var kmRate = Number(r.kmRate) || _defRate;

    var basePrice = Number(r.basePrice || 0);
    var price = Number(r.price || 0);
    var kmOut = Number(r.kmOut || 0);
    var kmIn = Number(r.kmIn || 0);
    var kmTotal = Math.max(0, kmIn - kmOut);

    var calOutDay = new Date(out.getFullYear(), out.getMonth(), out.getDate());
    var calInDay = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate());
    var joursCalRaw = Math.round((calInDay - calOutDay) / 86400000);

    var lateExtraDay = (joursCalRaw >= 1 && extraH >= 7) ? 1 : 0;
    var heuresOMR = 0;
    if (joursCalRaw >= 1 && !lateExtraDay && diffMin > 60) {
      var extraMinAfterFirstHour = diffMin - 60;
      var fullExtraHours = Math.floor(extraMinAfterFirstHour / 60);
      var remainderMin = extraMinAfterFirstHour % 60;
      heuresOMR = fullExtraHours + (remainderMin > 30 ? 1 : 0);
    }
    var joursCal = joursCalRaw === 0 ? 1 : joursCalRaw;
    var joursFactures = joursCal + lateExtraDay;

    var periodDays = durationType === 'weekly' ? 7 : 30;
    var bp = (durationType !== 'daily') ? (basePrice > 0 ? basePrice : Math.round(price * periodDays * 100) / 100) : price;
    var dayPrice = (durationType !== 'daily') ? Math.round((bp / periodDays) * 100) / 100 : price;
    var calPeriods = (durationType !== 'daily') ? Math.floor(joursCal / periodDays) : 0;
    var calRemDays = (durationType !== 'daily') ? joursCal % periodDays : joursCal;

    // Rent — IDENTICAL calculation to calcBAL() / the contract modal.
    var prixJours;
    if (durationType === 'daily') {
      prixJours = price * joursFactures;
    } else {
      var rawPrix = Math.round((calPeriods * bp + calRemDays * dayPrice + lateExtraDay * dayPrice) * 100) / 100;
      prixJours = (durationType === 'monthly' || durationType === 'weekly') ? Math.max(bp, rawPrix) : rawPrix;
    }

    var kmResult = { kmMonthsCharge: 0, kmDaysCharge: 0, extraCharge: 0 };
    if (kmIn && kmOut && typeof calcKmExtra === 'function') {
      kmResult = calcKmExtra(kmTotal, durationType, is4x4, kmRate, joursFactures, bp);
    }
    var kmCharge = (kmResult.kmMonthsCharge || 0) + (kmResult.kmDaysCharge || 0) + (kmResult.extraCharge || 0);

    var fuelOutOMR = (typeof fuelToOMR === 'function') ? fuelToOMR(r.fuelOut) : 0;
    var fuelInOMR = (typeof fuelToOMR === 'function') ? fuelToOMR(r.fuelIn) : 0;
    var petrol = Math.max(0, fuelOutOMR - fuelInOMR);

    var cleanFee = (r.cleanBefore !== 'dirty' && r.cleanAfter === 'dirty') ? 1 : 0;

    return { rent: prixJours, petrol: petrol, extraKm: kmCharge, extraTime: heuresOMR, carwash: cleanFee };
  } catch (e) {
    return { rent: 0, petrol: 0, extraKm: 0, extraTime: 0, carwash: 0 };
  }
}

// ── allocateContractCategories — allocates the actual PAID amount across items ──
// Priority: rent (up to its calculated price) FIRST, then the remainder is
// allocated to petrol > extraKm > extraTime > carwash (in that order, each
// up to its own calculated price). Any true leftover (e.g. an overpayment
// beyond the contract's total due — should not normally happen) is folded
// back into "rent" so the allocation always sums exactly to paidTotal.
function allocateContractCategories(r, paidTotal) {
  var due = calcCategoryDueAmounts(r);
  var remaining = Math.max(0, Number(paidTotal) || 0);
  var alloc = { rent: 0, petrol: 0, extraKm: 0, extraTime: 0, carwash: 0 };

  var rentTake = Math.min(due.rent || 0, remaining);
  alloc.rent = rentTake;
  remaining -= rentTake;

  ['petrol', 'extraKm', 'extraTime', 'carwash'].forEach(function (k) {
    var take = Math.min(due[k] || 0, remaining);
    alloc[k] = take;
    remaining -= take;
  });

  // Edge case: paid more than the contract's total calculated price —
  // keep the invariant (sum of alloc === paidTotal) by parking the
  // surplus back on Rent rather than silently dropping it.
  if (remaining > 0) alloc.rent += remaining;

  return alloc;
}

// ── getRentalPaidTotal — same logic as calcBAL() for the amount actually paid ──
function getRentalPaidTotal(r) {
  try {
    if (typeof paymentsForContract === 'function') {
      var pays = paymentsForContract(r.contract, r.branch, r.vehicleId);
      var sum = pays.reduce(function (s, p) { return s + (Number(p.paid || p.price || p.amount || 0)); }, 0);
      if (sum > 0) return sum;
    }
  } catch (e) {}
  return Number(r.paid || 0);
}

// ── resolveCategoryVehicleName ──
function resolveCategoryVehicleName(normalizedPlate, vehicles) {
  if (vehicles && vehicles.length) {
    var vehicle = vehicles.find(function (v) { return v && v.plate && normalizePlateGlobal(v.plate) === normalizedPlate; });
    if (vehicle && vehicle.name && vehicle.name !== 'Unknown') return vehicle.name;
  }
  var gpsLinks = (typeof DB !== 'undefined' && DB.gpsLinks) ? DB.gpsLinks : [];
  if (gpsLinks.length) {
    var gps = gpsLinks.find(function (g) { return g && g.plate && normalizePlateGlobal(g.plate) === normalizedPlate; });
    if (gps && gps.name && gps.name.trim()) return gps.name.trim();
  }
  if (typeof PLATE_VEHICLE_MAP !== 'undefined') {
    var mapKeys = Object.keys(PLATE_VEHICLE_MAP);
    var matched = mapKeys.find(function (k) { return normalizePlateGlobal(k) === normalizedPlate; });
    if (matched) return PLATE_VEHICLE_MAP[matched];
  }
  return normalizedPlate;
}

// ── calculateCategoryStats — aggregates by vehicle, filtered by date + plate ──
function calculateCategoryStats(rentals, vehicles, opts) {
  opts = opts || {};
  var dateFrom = opts.dateFrom || '';
  var dateTo = opts.dateTo || '';
  var selectedPlate = opts.selectedPlate || 'all';
  var normalizedSelected = selectedPlate !== 'all' ? normalizePlateGlobal(selectedPlate) : 'all';

  var result = { totals: { petrol: 0, extraKm: 0, extraTime: 0, carwash: 0, rent: 0 }, totalContracts: 0, vehicles: [] };
  var vehicleMap = {};

  (rentals || []).forEach(function (r) {
    if (!r.dateOut) return;
    var d = normalizeDate(r.dateOut);
    if (dateFrom && (!d || d < dateFrom)) return;
    if (dateTo && (!d || d > dateTo)) return;

    // Résolution de plaque IDENTIQUE à depResolveNormalizedPlate() (module-depence.js)
    // pour garantir que la clé véhicule utilisée ici concorde avec celle des dépenses
    // (indispensable pour le futur calcul de profit = revenue - dépenses par véhicule).
    var rawPlate = r._plate || r.plate || '';
    var vMatch = (r.vehicleId && vehicles && vehicles.length)
      ? vehicles.find(function (v) { return v && v.id === r.vehicleId; })
      : null;
    if (!rawPlate && vMatch && vMatch.plate) rawPlate = vMatch.plate;

    var normalizedPlate = rawPlate
      ? normalizePlateGlobal(rawPlate)
      : (r.vehicleId ? 'VID:' + r.vehicleId : '');
    if (!normalizedPlate) return;
    if (normalizedSelected !== 'all' && normalizedPlate !== normalizedSelected) return;

    var paidTotal = getRentalPaidTotal(r);
    if (paidTotal <= 0) return;

    var alloc = allocateContractCategories(r, paidTotal);

    if (!vehicleMap[normalizedPlate]) {
      vehicleMap[normalizedPlate] = {
        plate: normalizedPlate,
        name: resolveCategoryVehicleName(normalizedPlate, vehicles),
        contracts: 0,
        petrol: 0, extraKm: 0, extraTime: 0, carwash: 0, rent: 0
      };
    }
    var v = vehicleMap[normalizedPlate];
    v.contracts++;
    v.petrol += alloc.petrol;
    v.extraKm += alloc.extraKm;
    v.extraTime += alloc.extraTime;
    v.carwash += alloc.carwash;
    v.rent += alloc.rent;

    result.totalContracts++;
    result.totals.petrol += alloc.petrol;
    result.totals.extraKm += alloc.extraKm;
    result.totals.extraTime += alloc.extraTime;
    result.totals.carwash += alloc.carwash;
    result.totals.rent += alloc.rent;
  });

  result.vehicles = Object.values(vehicleMap).map(function (v) {
    v.total = v.petrol + v.extraKm + v.extraTime + v.carwash + v.rent;
    return v;
  }).sort(function (a, b) { return b.total - a.total; });

  result.grandTotal = result.totals.petrol + result.totals.extraKm + result.totals.extraTime + result.totals.carwash + result.totals.rent;
  return result;
}

function populateCategoryVehicleSelect() {
  var data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  var vehicles = data.vehicles || [];
  var rentals = data.rentals || [];
  var select = document.getElementById('category-vehicle-select');
  if (!select) return;
  var prevVal = select.value || 'all';
  var options = '<option value="all">' + translate('rev.allVehicles') + '</option>';
  var allPlates = new Set();
  rentals.forEach(function (r) { var p = r._plate || r.plate || ''; if (p) allPlates.add(p); });
  vehicles.forEach(function (v) { if (v.plate) allPlates.add(v.plate); });
  var plateToName = {};
  vehicles.forEach(function (v) { if (v.plate) plateToName[v.plate] = v.name || v.plate; });
  var sortedPlates = Array.from(allPlates).sort(function (a, b) {
    return (plateToName[a] || a).localeCompare(plateToName[b] || b);
  });
  sortedPlates.forEach(function (plate) {
    options += '<option value="' + plate + '">' + (plateToName[plate] || plate) + ' (' + plate + ')</option>';
  });
  select.innerHTML = options;
  select.value = prevVal;
}

function toggleCategoryFilter(key) {
  if (!(key in g_categoryFilters)) return;
  g_categoryFilters[key] = !g_categoryFilters[key];
  var chip = document.getElementById('cat-filter-' + key);
  if (chip) chip.classList.toggle('on', g_categoryFilters[key]);
  renderCategoryStats();
}

function clearCategoryFilters() {
  var from = document.getElementById('category-date-from');
  var to = document.getElementById('category-date-to');
  var sel = document.getElementById('category-vehicle-select');
  if (from) from.value = '';
  if (to) to.value = '';
  if (sel) sel.value = 'all';
  renderCategoryStats();
}

// ── getPreviousPeriodRange — computes the N-1 period (same length) for comparison ──
function getPreviousPeriodRange(dateFrom, dateTo) {
  var today = new Date().toISOString().split('T')[0];
  var from = dateFrom, to = dateTo || today;
  if (!from) {
    var now = new Date();
    from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
    to = today;
  }
  var fromD = new Date(from);
  var toD = new Date(to);
  var spanMs = Math.max(0, toD - fromD);
  var prevTo = new Date(fromD.getTime() - 86400000);
  var prevFrom = new Date(prevTo.getTime() - spanMs);
  return {
    prevFrom: prevFrom.toISOString().split('T')[0],
    prevTo: prevTo.toISOString().split('T')[0]
  };
}

function createCategoryStackedChart(vehicles) {
  if (!vehicles || vehicles.length === 0) return '<div style="text-align:center;color:var(--muted);padding:40px">' + translate('rev.noDataAvailable') + '</div>';
  var keys = ['petrol', 'extraKm', 'extraTime', 'carwash', 'rent'].filter(function (k) { return g_categoryFilters[k]; });
  if (keys.length === 0) return '<div style="text-align:center;color:var(--muted);padding:40px">' + (translate('rev.allCategoriesOff') || 'All categories are hidden') + '</div>';
  var maxTotal = Math.max.apply(Math, vehicles.map(function (v) {
    return keys.reduce(function (s, k) { return s + v[k]; }, 0);
  }).concat([1]));

  var legend = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;font-size:.72rem">';
  keys.forEach(function (k) {
    legend += '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:' + CATEGORY_COLORS[k] + ';display:inline-block"></span>' + categoryLabel(k) + '</span>';
  });
  legend += '</div>';

  var html = legend + '<div style="display:flex;flex-direction:column;gap:10px">';
  vehicles.forEach(function (v) {
    var total = keys.reduce(function (s, k) { return s + v[k]; }, 0);
    html += '<div>' +
      '<div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:3px"><strong>' + escapeHtml(v.plate) + '</strong><span style="color:var(--muted)">' + fmtNum(total) + ' OMR</span></div>' +
      '<div style="display:flex;height:18px;border-radius:4px;overflow:hidden;background:var(--s2)">';
    keys.forEach(function (k) {
      var w = maxTotal > 0 ? (v[k] / maxTotal) * 100 : 0;
      if (v[k] > 0) html += '<div title="' + categoryLabel(k) + ': ' + fmtNum(v[k]) + ' OMR" style="width:' + w + '%;background:' + CATEGORY_COLORS[k] + '"></div>';
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

// ── renderCategoryStats — orchestrates the By Category tab ──
function renderCategoryStats() {
  ensurePageLoaded('revenue-stats');
  var data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  var rentals = data.rentals || [];
  var vehicles = data.vehicles || [];

  populateCategoryVehicleSelect();

  var dateFrom = document.getElementById('category-date-from') ? document.getElementById('category-date-from').value : '';
  var dateTo = document.getElementById('category-date-to') ? document.getElementById('category-date-to').value : '';
  var selectedPlate = document.getElementById('category-vehicle-select') ? document.getElementById('category-vehicle-select').value : 'all';

  var infoEl = document.getElementById('category-filter-info');
  if (infoEl) {
    var txt = (dateFrom || dateTo)
      ? (translate('rev.filterLabel') + ': ' + (dateFrom || translate('rev.start')) + ' ' + translate('rev.to') + ' ' + (dateTo || translate('rev.today')))
      : translate('rev.allPeriods');
    txt += ' | ' + translate('rev.vehicleLabel') + ': ' + (selectedPlate === 'all' ? translate('rev.all') : selectedPlate);
    infoEl.textContent = txt;
  }

  var stats = calculateCategoryStats(rentals, vehicles, { dateFrom: dateFrom, dateTo: dateTo, selectedPlate: selectedPlate });
  g_lastCategoryStats = stats;

  // ── N vs N-1 comparison ──
  var range = getPreviousPeriodRange(dateFrom, dateTo);
  var prevStats = calculateCategoryStats(rentals, vehicles, { dateFrom: range.prevFrom, dateTo: range.prevTo, selectedPlate: selectedPlate });

  function pct(cur, prev) {
    if (prev <= 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  }

  var summaryEl = document.getElementById('category-summary');
  if (summaryEl) {
    var keys = ['petrol', 'extraKm', 'extraTime', 'carwash', 'rent'];
    var html = '<div class="stat-card blue">' +
      '<div class="stat-label">' + (translate('rev.grandTotal') || 'Grand Total') + '</div>' +
      '<div class="stat-val">' + fmtNum(stats.grandTotal) + ' <span style="font-size:.9rem">OMR</span></div>' +
      '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">' + stats.totalContracts + ' ' + translate('rev.contracts') + '</div>' +
    '</div>';
    keys.forEach(function (k) {
      var cur = stats.totals[k];
      var prev = prevStats.totals[k];
      var change = pct(cur, prev);
      var changeColor = change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--muted)';
      var changeIcon = change > 0 ? '▲' : change < 0 ? '▼' : '—';
      html += '<div class="stat-card" style="border-left:3px solid ' + CATEGORY_COLORS[k] + '">' +
        '<div class="stat-label">' + categoryLabel(k) + '</div>' +
        '<div class="stat-val">' + fmtNum(cur) + ' <span style="font-size:.9rem">OMR</span></div>' +
        '<div style="font-size:.72rem;color:' + changeColor + ';font-weight:700;margin-top:6px">' + changeIcon + ' ' + Math.abs(change).toFixed(1) + '% ' + (translate('rev.vsPrevPeriod') || 'vs prev. period') + '</div>' +
      '</div>';
    });
    summaryEl.innerHTML = html;
  }

  var chartEl = document.getElementById('category-chart');
  if (chartEl) chartEl.innerHTML = createCategoryStackedChart(stats.vehicles.slice(0, 15));

  var activeKeys = ['petrol', 'extraKm', 'extraTime', 'carwash', 'rent'].filter(function (k) { return g_categoryFilters[k]; });
  var theadRow = document.getElementById('category-thead-row');
  if (theadRow) {
    var headHtml = '<th>' + translate('rev.vehicleLabel') + '</th><th>' + (translate('col.plate') || 'Plate') + '</th><th>' + translate('rev.contracts') + '</th>';
    activeKeys.forEach(function (k) { headHtml += '<th>' + categoryLabel(k) + ' (OMR)</th>'; });
    headHtml += '<th>' + (translate('rev.total') || 'Total') + ' (OMR)</th>';
    theadRow.innerHTML = headHtml;
  }

  var tableHTML = '';
  stats.vehicles.forEach(function (v) {
    var rowTotal = 0;
    activeKeys.forEach(function (k) { rowTotal += v[k]; });
    tableHTML += '<tr style="cursor:pointer" data-app-action="open-vehicle-drilldown" data-plate="' + escapeHtml(v.plate) + '" data-label="' + escapeHtml(v.name) + '" data-from="' + escapeHtml(dateFrom) + '" data-to="' + escapeHtml(dateTo) + '" title="' + (translate('rev.clickForDetails') || 'Click for contract details') + '">' +
      '<td><span class="badge badge-blue">' + escapeHtml(v.name) + '</span></td>' +
      '<td style="font-family:var(--mono);font-weight:700">' + escapeHtml(v.plate) + '</td>' +
      '<td>' + v.contracts + '</td>';
    activeKeys.forEach(function (k) {
      tableHTML += '<td style="color:' + CATEGORY_COLORS[k] + ';font-weight:600">' + fmtNum(v[k]) + '</td>';
    });
    tableHTML += '<td style="font-weight:800;color:var(--green)">' + fmtNum(rowTotal) + '</td>' +
    '</tr>';
  });
  var tbody = document.getElementById('category-tbody');
  if (tbody) tbody.innerHTML = tableHTML || '<tr><td colspan="' + (3 + activeKeys.length + 1) + '" class="rev-empty">' + translate('rev.noDataMatchingFilter') + '</td></tr>';

  var countEl = document.getElementById('category-table-count');
  if (countEl) countEl.textContent = stats.vehicles.length + ' ' + translate('rev.vehicles') + ' • ' + translate('rev.total') + ': ' + fmtNum(stats.grandTotal) + ' OMR';
}

// ── exportCategoryCSV — raw export for Excel ──
function exportCategoryCSV() {
  if (!g_lastCategoryStats) return;
  var activeKeys = ['petrol', 'extraKm', 'extraTime', 'carwash', 'rent'].filter(function (k) { return g_categoryFilters[k]; });
  var rows = [['Vehicle', 'Plate', 'Contracts'].concat(activeKeys.map(categoryLabel)).concat(['Total (OMR)'])];
  g_lastCategoryStats.vehicles.forEach(function (v) {
    var rowTotal = 0;
    var row = [v.name, v.plate, v.contracts];
    activeKeys.forEach(function (k) { row.push(v[k].toFixed(2)); rowTotal += v[k]; });
    row.push(rowTotal.toFixed(2));
    rows.push(row);
  });
  rows.push([]);
  var totalsRow = ['TOTAL', '', g_lastCategoryStats.totalContracts];
  activeKeys.forEach(function (k) { totalsRow.push(g_lastCategoryStats.totals[k].toFixed(2)); });
  totalsRow.push(g_lastCategoryStats.grandTotal.toFixed(2));
  rows.push(totalsRow);

  var csv = rows.map(function (r) {
    return r.map(function (cell) {
      var s = String(cell === undefined || cell === null ? '' : cell);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');

  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'revenue-by-category_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.renderCategoryStats = renderCategoryStats;
window.clearCategoryFilters = clearCategoryFilters;
window.toggleCategoryFilter = toggleCategoryFilter;
window.exportCategoryCSV = exportCategoryCSV;

/* ═══════════════════════════════════════════════════════════
   FINANCIAL OVERVIEW — global dashboard + Outstanding/Aging + Contract Analysis
   ═══════════════════════════════════════════════════════════ */

var g_lastOverviewData = null;

// ── calculateContractAnalysis — over an already period-filtered set of rentals ──
function calculateContractAnalysis(rentals) {
  var result = { total: 0, active: 0, completed: 0, totalValue: 0, totalDuration: 0, highest: null, lowest: null };

  (rentals || []).forEach(function (r) {
    if (!r.dateOut) return;
    var paid = getRentalPaidTotal(r);
    var isOpen = !r.dateIn;
    result.total++;
    if (isOpen) result.active++; else result.completed++;

    var duration;
    if (isOpen) {
      var out = new Date(r.dateOut), now = new Date();
      duration = isNaN(out.getTime()) ? 1 : Math.max(1, Math.round((now - out) / 86400000));
    } else {
      var out2 = new Date(r.dateOut), in2 = new Date(r.dateIn);
      duration = (isNaN(out2.getTime()) || isNaN(in2.getTime())) ? 1 : Math.max(1, Math.round((in2 - out2) / 86400000));
    }
    result.totalDuration += duration;
    result.totalValue += paid;

    if (paid > 0) {
      if (!result.highest || paid > result.highest.paid) result.highest = { contract: r.contract || '—', plate: r._plate || r.plate || '—', paid: paid };
      if (!result.lowest || paid < result.lowest.paid) result.lowest = { contract: r.contract || '—', plate: r._plate || r.plate || '—', paid: paid };
    }
  });

  result.avgValue = result.total > 0 ? result.totalValue / result.total : 0;
  result.avgDuration = result.total > 0 ? result.totalDuration / result.total : 0;
  result.revenuePerDay = result.totalDuration > 0 ? result.totalValue / result.totalDuration : 0;
  return result;
}

// ── calculateOutstanding — current receivables (today's snapshot, NOT period-filtered) ──
// Age = days elapsed since dateOut (there is no separate "due date" field in the current
// schema, so vehicle return date is used as the reference, consistent with calcBAL/calcOpenContractBAL)
function calculateOutstanding(rentals) {
  var buckets = { b0_7: 0, b8_30: 0, b31_60: 0, b60p: 0 };
  var rows = [];
  var today = new Date();

  (rentals || []).forEach(function (r) {
    if (!r.dateOut) return;
    var bal = 0;
    if (!r.dateIn) {
      if (typeof calcOpenContractBAL === 'function') {
        var openBal = calcOpenContractBAL(r);
        if (openBal !== null) {
          var totalDue = openBal + Number(r.paid || 0);
          var actualPaid = getRentalPaidTotal(r);
          bal = Math.round((totalDue - actualPaid) * 100) / 100;
        }
      }
    } else if (typeof calcBAL === 'function') {
      bal = calcBAL(r);
    }
    if (!bal || bal <= 0) return;

    var out = new Date(r.dateOut);
    var ageDays = isNaN(out.getTime()) ? 0 : Math.max(0, Math.round((today - out) / 86400000));
    var bucket = ageDays <= 7 ? 'b0_7' : ageDays <= 30 ? 'b8_30' : ageDays <= 60 ? 'b31_60' : 'b60p';
    buckets[bucket] += bal;

    rows.push({
      client: r._clientName || r.clientName || '—',
      contract: r.contract || '—',
      plate: r._plate || r.plate || '—',
      amount: bal,
      dateOut: r.dateOut,
      age: ageDays,
      bucket: bucket
    });
  });

  rows.sort(function (a, b) { return b.age - a.age; });
  var total = buckets.b0_7 + buckets.b8_30 + buckets.b31_60 + buckets.b60p;
  return { buckets: buckets, rows: rows, total: total };
}

function ovLabel(key, fallback) {
  var t = translate('ov.' + key);
  return (t && t !== 'ov.' + key) ? t : fallback;
}

function caRow(label, value) {
  return '<div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);font-size:.85rem">' +
    '<span style="color:var(--muted)">' + label + '</span><span style="font-weight:700">' + value + '</span></div>';
}
function agingCard(color, label, value) {
  return '<div class="stat-card" style="border-left:3px solid ' + color + '">' +
    '<div class="stat-label">' + label + '</div>' +
    '<div class="stat-val" style="font-size:1.1rem">' + fmtNum(value) + ' <span style="font-size:.8rem">OMR</span></div>' +
  '</div>';
}

function clearOverviewFilters() {
  var from = document.getElementById('overview-month-from');
  var to = document.getElementById('overview-month-to');
  if (from) from.value = '';
  if (to) to.value = '';
  var fromLbl = document.getElementById('overview-month-from-label');
  var toLbl = document.getElementById('overview-month-to-label');
  if (fromLbl && typeof _calLabelFor === 'function') fromLbl.textContent = _calLabelFor('', 'month');
  if (toLbl && typeof _calLabelFor === 'function') toLbl.textContent = _calLabelFor('', 'month');
  renderOverviewStats();
}

// ── renderOverviewStats — orchestrates the Overview tab ──
function renderOverviewStats() {
  ensurePageLoaded('revenue-stats');
  var data = (typeof DB !== 'undefined' && DB) ? DB : (window._data || window.data || {});
  var payments = data.payments || [];
  var rentals = data.rentals || [];
  var vehicles = data.vehicles || [];
  var depence = data.depence || [];

  var monthFrom = document.getElementById('overview-month-from') ? document.getElementById('overview-month-from').value : '';
  var monthTo = document.getElementById('overview-month-to') ? document.getElementById('overview-month-to').value : '';

  var infoEl = document.getElementById('overview-filter-info');
  if (infoEl) {
    infoEl.textContent = (monthFrom || monthTo)
      ? (translate('rev.filterLabel') + ': ' + (monthFrom || translate('rev.start')) + ' ' + translate('rev.to') + ' ' + (monthTo || translate('rev.now').toLowerCase()))
      : translate('rev.allPeriods');
  }

  var filteredPayments = filterPaymentsByMonthRange(payments, monthFrom, monthTo);
  var filteredRentals = filterRentalsByMonthRange(rentals, monthFrom, monthTo);
  var filteredDepence = filterDepenceByMonthRange(depence, monthFrom, monthTo);

  var profitData = calculateProfitByPlate(filteredPayments, filteredRentals, filteredDepence, vehicles);
  var totalExpenses = profitData.totalVehicleExpenses + profitData.totalGeneralExpenses;
  var netProfit = profitData.totalRevenue - totalExpenses;
  var margin = profitData.totalRevenue > 0 ? (netProfit / profitData.totalRevenue) * 100 : 0;

  // Payment method breakdown (on the filtered payments)
  var methodTotals = {};
  filteredPayments.forEach(function (p) {
    var amount = parseFloat(p.amount || p.paid || p.price || 0);
    if (amount <= 0) return;
    var method = (p.paymentMethod || p.method || 'OTHER').toUpperCase();
    methodTotals[method] = (methodTotals[method] || 0) + amount;
  });
  var cashTotal = methodTotals['CASH'] || 0;
  var otherMethodsTotal = Math.max(0, profitData.totalRevenue - cashTotal);

  // Outstanding — CURRENT snapshot (a receivable doesn't depend on a past period filter)
  var outstanding = calculateOutstanding(rentals);

  // Contract analysis — over rentals from the selected period
  var contractAnalysis = calculateContractAnalysis(filteredRentals);

  var vehicleCount = vehicles.length || 1;
  var avgRevenuePerRental = contractAnalysis.total > 0 ? profitData.totalRevenue / contractAnalysis.total : 0;
  var avgRevenuePerVehicle = profitData.totalRevenue / vehicleCount;

  // ── KPI CARDS — 3 blocs (Revenue/Profit, Cash/Cheque/Outstanding, Rentals) ──
  function kpi(color, label, value, suffix, sub) {
    return '<div class="stat-card ' + color + '">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-val">' + fmtNum(value) + (suffix ? ' <span style="font-size:.9rem">' + suffix + '</span>' : '') + '</div>' +
      (sub ? '<div style="font-size:.72rem;color:var(--muted);margin-top:6px">' + sub + '</div>' : '') +
    '</div>';
  }

  var kpiRevEl = document.getElementById('overview-kpis-revenue');
  if (kpiRevEl) {
    kpiRevEl.innerHTML =
      kpi('green', translate('rev.totalRevenue') || 'Revenue', profitData.totalRevenue, 'OMR') +
      kpi('red', translate('rev.totalExpenses') || 'Expenses', totalExpenses, 'OMR') +
      kpi(netProfit >= 0 ? 'blue' : 'red', translate('rev.netProfit') || 'Net Profit', netProfit, 'OMR') +
      kpi('purple', translate('rev.margin') || 'Margin', margin.toFixed(1), '%');
  }

  var kpiCashEl = document.getElementById('overview-kpis-cash');
  if (kpiCashEl) {
    kpiCashEl.innerHTML =
      kpi('yellow', ovLabel('cashReceived', 'Cash Received'), cashTotal, 'OMR') +
      kpi('blue', ovLabel('otherMethods', 'Cheques / Other Methods'), otherMethodsTotal, 'OMR') +
      kpi(outstanding.total > 0 ? 'red' : 'green', ovLabel('outstandingBal', 'Outstanding BAL'), outstanding.total, 'OMR', ovLabel('currentSnapshot', 'current, not period-filtered'));
  }

  var kpiRentEl = document.getElementById('overview-kpis-rentals');
  if (kpiRentEl) {
    kpiRentEl.innerHTML =
      kpi('purple', ovLabel('numRentals', 'Number of Rentals'), contractAnalysis.total, '') +
      kpi('blue', ovLabel('avgRevRental', 'Avg Revenue / Rental'), avgRevenuePerRental, 'OMR') +
      kpi('green', ovLabel('avgRevVehicle', 'Avg Revenue / Vehicle'), avgRevenuePerVehicle, 'OMR');
  }

  // ── CONTRACT ANALYSIS ──
  var caEl = document.getElementById('overview-contract-analysis');
  if (caEl) {
    caEl.innerHTML =
      caRow(ovLabel('totalContracts', 'Total Contracts'), contractAnalysis.total) +
      caRow(ovLabel('activeContracts', 'Active Contracts'), contractAnalysis.active) +
      caRow(ovLabel('completedContracts', 'Completed Contracts'), contractAnalysis.completed) +
      caRow(ovLabel('avgRentalValue', 'Average Rental Value'), fmtNum(contractAnalysis.avgValue) + ' OMR') +
      caRow(ovLabel('avgRentalDuration', 'Average Rental Duration'), contractAnalysis.avgDuration.toFixed(1) + ' ' + translate('rev.days')) +
      caRow(ovLabel('revenuePerDay', 'Revenue / Rental Day'), fmtNum(contractAnalysis.revenuePerDay) + ' OMR') +
      caRow(ovLabel('highestContract', 'Highest-value Contract'), contractAnalysis.highest ? (escapeHtml(String(contractAnalysis.highest.contract)) + ' — ' + fmtNum(contractAnalysis.highest.paid) + ' OMR') : '—') +
      caRow(ovLabel('lowestContract', 'Lowest-value Contract'), contractAnalysis.lowest ? (escapeHtml(String(contractAnalysis.lowest.contract)) + ' — ' + fmtNum(contractAnalysis.lowest.paid) + ' OMR') : '—');
  }

  // ── OUTSTANDING / AGING ──
  var agingEl = document.getElementById('overview-aging-summary');
  if (agingEl) {
    agingEl.innerHTML =
      agingCard('#22c55e', '🟢 0–7 ' + translate('rev.days'), outstanding.buckets.b0_7) +
      agingCard('#eab308', '🟡 8–30 ' + translate('rev.days'), outstanding.buckets.b8_30) +
      agingCard('#f97316', '🟠 31–60 ' + translate('rev.days'), outstanding.buckets.b31_60) +
      agingCard('#dc2626', '🔴 60+ ' + translate('rev.days'), outstanding.buckets.b60p);
  }

  var bucketColors = { b0_7: '#22c55e', b8_30: '#eab308', b31_60: '#f97316', b60p: '#dc2626' };
  var bucketLabels = { b0_7: '0-7d', b8_30: '8-30d', b31_60: '31-60d', b60p: '60+d' };
  var agingHTML = '';
  outstanding.rows.forEach(function (row) {
    agingHTML += '<tr>' +
      '<td>' + escapeHtml(row.client) + '</td>' +
      '<td style="font-family:var(--mono)">' + escapeHtml(String(row.contract)) + '</td>' +
      '<td style="font-family:var(--mono)">' + escapeHtml(row.plate) + '</td>' +
      '<td style="color:var(--red);font-weight:700">' + fmtNum(row.amount) + ' OMR</td>' +
      '<td>' + escapeHtml(row.dateOut ? String(row.dateOut).substring(0, 10) : '—') + '</td>' +
      '<td>' + row.age + ' ' + translate('rev.days') + '</td>' +
      '<td><span style="background:' + bucketColors[row.bucket] + '22;color:' + bucketColors[row.bucket] + ';padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:700">' + bucketLabels[row.bucket] + '</span></td>' +
    '</tr>';
  });
  var agingTbody = document.getElementById('overview-aging-tbody');
  if (agingTbody) agingTbody.innerHTML = agingHTML || '<tr><td colspan="7" class="rev-empty">' + ovLabel('noOutstanding', 'No outstanding balances 🎉') + '</td></tr>';

  var agingCountEl = document.getElementById('overview-aging-count');
  if (agingCountEl) agingCountEl.textContent = outstanding.rows.length + ' ' + ovLabel('receivables', 'receivables') + ' • ' + translate('rev.total') + ': ' + fmtNum(outstanding.total) + ' OMR';

  g_lastOverviewData = {
    profitData: profitData, outstanding: outstanding, contractAnalysis: contractAnalysis,
    netProfit: netProfit, totalExpenses: totalExpenses, cashTotal: cashTotal, otherMethodsTotal: otherMethodsTotal,
    avgRevenuePerRental: avgRevenuePerRental, avgRevenuePerVehicle: avgRevenuePerVehicle
  };
}

// ── exportOverviewCSV — raw export for Excel ──
function exportOverviewCSV() {
  if (!g_lastOverviewData) return;
  var d = g_lastOverviewData;
  var rows = [
    ['Metric', 'Value'],
    ['Total Revenue (OMR)', d.profitData.totalRevenue.toFixed(2)],
    ['Total Expenses (OMR)', d.totalExpenses.toFixed(2)],
    ['Net Profit (OMR)', d.netProfit.toFixed(2)],
    ['Cash Received (OMR)', d.cashTotal.toFixed(2)],
    ['Cheques / Other Methods (OMR)', d.otherMethodsTotal.toFixed(2)],
    ['Outstanding BAL (OMR)', d.outstanding.total.toFixed(2)],
    [],
    ['Aging bucket', 'Amount (OMR)'],
    ['0-7 days', d.outstanding.buckets.b0_7.toFixed(2)],
    ['8-30 days', d.outstanding.buckets.b8_30.toFixed(2)],
    ['31-60 days', d.outstanding.buckets.b31_60.toFixed(2)],
    ['60+ days', d.outstanding.buckets.b60p.toFixed(2)],
    [],
    ['Client', 'Contract', 'Plate', 'Amount Due (OMR)', 'Date Out', 'Age (days)', 'Bucket']
  ];
  d.outstanding.rows.forEach(function (row) {
    rows.push([row.client, row.contract, row.plate, row.amount.toFixed(2), row.dateOut || '', row.age, row.bucket]);
  });

  var csv = rows.map(function (r) {
    return r.map(function (cell) {
      var s = String(cell === undefined || cell === null ? '' : cell);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');

  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'financial-overview_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.renderOverviewStats = renderOverviewStats;
window.clearOverviewFilters = clearOverviewFilters;
window.exportOverviewCSV = exportOverviewCSV;

