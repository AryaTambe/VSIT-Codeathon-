// Set today's date as default
document.querySelector('input[name="date"]').valueAsDate = new Date();

// Chart instances
var expenseChart = null;
var incomeChart = null;
var comparisonChart = null;

// Fetch and display user data
fetch('/api/me')
  .then(function(res) {
    if (!res.ok) throw new Error('Failed to fetch user');
    return res.json();
  })
  .then(function(data) {
    var user = data.user;
    document.getElementById('userId').textContent = user.id;
    document.getElementById('userName').textContent = user.name || 'N/A';
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userGreeting').textContent = 'Welcome, ' + (user.name || user.email) + '!';
  })
  .catch(function(err) {
    console.error(err);
    document.getElementById('userGreeting').textContent = 'Welcome!';
  });

// Load transactions on page load
loadTransactions();

// Form submission
document.getElementById('transactionForm').addEventListener('submit', function (e) {
  e.preventDefault();
  
  var formData = new FormData(this);
  var data = {
    type: formData.get('type'),
    amount: parseFloat(formData.get('amount')),
    category: formData.get('category'),
    description: formData.get('description'),
    date: formData.get('date')
  };

  fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to add transaction');
      return res.json();
    })
    .then(function() {
      document.getElementById('transactionForm').reset();
      document.querySelector('input[name="date"]').valueAsDate = new Date();
      loadTransactions();
    })
    .catch(function(err) {
      console.error(err);
      alert('Failed to add transaction');
    });
});

// Load and display transactions
function loadTransactions() {
  fetch('/api/transactions')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    })
    .then(function(data) {
      var transactions = data.transactions || [];
      updateSummary(transactions);
      displayTransactions(transactions);
    })
    .catch(function(err) {
      console.error(err);
      document.getElementById('transactionsList').innerHTML = '<p class="empty-state">Error loading transactions</p>';
    });
}

// Update summary cards
function updateSummary(transactions) {
  var totalIncome = 0;
  var totalExpense = 0;

  transactions.forEach(function(t) {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else if (t.type === 'expense') {
      totalExpense += t.amount;
    }
  });

  var balance = totalIncome - totalExpense;

  document.getElementById('totalIncome').textContent = '₹' + totalIncome.toFixed(2);
  document.getElementById('totalExpense').textContent = '₹' + totalExpense.toFixed(2);
  document.getElementById('totalBalance').textContent = '₹' + balance.toFixed(2);
  
  // Update charts
  updateCharts(transactions);
}

// Display transactions list
function displayTransactions(transactions) {
  var container = document.getElementById('transactionsList');

  if (transactions.length === 0) {
    container.innerHTML = '<div class="text-center py-12"><p class="text-gray-500 text-lg">No transactions yet. Add one to get started!</p></div>';
    return;
  }

  container.innerHTML = transactions.map(function(t) {
    var date = new Date(t.date).toLocaleDateString();
    var isIncome = t.type === 'income';
    var amountSign = isIncome ? '+' : '-';
    var amountColor = isIncome ? 'text-green-700' : 'text-red-700';
    var amountBg = isIncome ? 'bg-green-50' : 'bg-red-50';

    return `
      <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg ${amountBg} flex items-center justify-center font-bold ${amountColor}">
              ${amountSign}
            </div>
            <div class="flex-1">
              <p class="font-semibold text-gray-900">${t.category || '(No category)'}</p>
              <p class="text-sm text-gray-600">${t.description || 'No description'}</p>
              <p class="text-xs text-gray-500 mt-1">${date}</p>
            </div>
          </div>
        </div>
        <div class="text-right mr-4">
          <p class="text-lg font-bold ${amountColor}">₹${t.amount.toFixed(2)}</p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition" onclick="editTransaction(${t.id}, '${t.type}', ${t.amount}, '${t.category || ''}', '${t.description || ''}', '${t.date}')">Edit</button>
          <button class="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition" onclick="deleteTransaction(${t.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

// Edit transaction (simple approach: delete and recreate)
function editTransaction(id, type, amount, category, description, date) {
  var newAmount = prompt('New amount:', amount);
  if (newAmount === null) return;

  var data = {
    type: type,
    amount: parseFloat(newAmount),
    category: category,
    description: description,
    date: date
  };

  fetch('/api/transactions/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to update');
      loadTransactions();
    })
    .catch(function(err) {
      console.error(err);
      alert('Failed to update transaction');
    });
}

// Delete transaction
function deleteTransaction(id) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;

  fetch('/api/transactions/' + id, {
    method: 'DELETE'
  })
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to delete');
      loadTransactions();
    })
    .catch(function(err) {
      console.error(err);
      alert('Failed to delete transaction');
    });
}

// Update pie charts by category
function updateCharts(transactions) {
  // Group by category
  var expensesByCategory = {};
  var incomeByCategory = {};

  transactions.forEach(function(t) {
    var category = t.category || 'Uncategorized';
    if (t.type === 'expense') {
      expensesByCategory[category] = (expensesByCategory[category] || 0) + t.amount;
    } else if (t.type === 'income') {
      incomeByCategory[category] = (incomeByCategory[category] || 0) + t.amount;
    }
  });

  // Render expense chart
  renderPieChart(
    'expenseChart',
    'Expenses by Category',
    expensesByCategory,
    expenseChart,
    function(chart) { expenseChart = chart; }
  );

  // Render income chart
  renderPieChart(
    'incomeChart',
    'Income by Category',
    incomeByCategory,
    incomeChart,
    function(chart) { incomeChart = chart; }
  );

  // Render comparison bar chart
  renderComparisonChart(transactions);
}

// Render or update a pie chart
function renderPieChart(canvasId, label, dataObj, existingChart, updateRef) {
  var ctx = document.getElementById(canvasId).getContext('2d');
  var categories = Object.keys(dataObj);
  var amounts = Object.values(dataObj);

  // Color palette
  var colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
  ];

  if (existingChart) {
    existingChart.destroy();
  }

  if (categories.length === 0) {
    var chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['No data'],
        datasets: [{
          data: [1],
          backgroundColor: ['#ddd']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
    updateRef(chart);
    return;
  }

  var chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: categories,
      datasets: [{
        data: amounts,
        backgroundColor: colors.slice(0, categories.length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.label + ': ₹' + context.parsed.toFixed(2);
            }
          }
        }
      }
    }
  });

  updateRef(chart);
}

// Render comparison bar chart (income vs expenses)
function renderComparisonChart(transactions) {
  var totalIncome = 0;
  var totalExpense = 0;

  transactions.forEach(function(t) {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else if (t.type === 'expense') {
      totalExpense += t.amount;
    }
  });

  var ctx = document.getElementById('comparisonChart').getContext('2d');

  if (comparisonChart) {
    comparisonChart.destroy();
  }

  comparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Total Income', 'Total Expenses'],
      datasets: [{
        label: 'Amount (₹)',
        data: [totalIncome, totalExpense],
        backgroundColor: ['#4CAF50', '#FF6B6B'],
        borderColor: ['#45a049', '#ff5252'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: 'y',
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return '₹' + context.parsed.x.toFixed(2);
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Amount (₹)'
          }
        }
      }
    }
  });
}
