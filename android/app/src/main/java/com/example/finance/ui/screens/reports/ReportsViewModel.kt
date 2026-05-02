package com.example.finance.ui.screens.reports

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.finance.data.repository.FinanceRepository
import com.example.finance.util.ExcelExporter
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class ReportsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: FinanceRepository
) : ViewModel() {

    private val _exportState = MutableStateFlow<ExportState>(ExportState.Idle)
    val exportState = _exportState.asStateFlow()

    private val _reportState = MutableStateFlow<ReportState>(ReportState.Idle)
    val reportState = _reportState.asStateFlow()

    private val _loanTrackerState = MutableStateFlow<LoanTrackerState>(LoanTrackerState.Idle)
    val loanTrackerState = _loanTrackerState.asStateFlow()

    fun generateReport(startDate: Long, endDate: Long) {
        viewModelScope.launch {
            _reportState.value = ReportState.Loading
            try {
                val payments = repository.getPaymentsByDateRange(startDate, endDate)
                val summary = calculateSummary(payments)
                _reportState.value = ReportState.Success(payments, summary)
            } catch (e: Exception) {
                _reportState.value = ReportState.Error("Failed to generate report: ${e.message}")
            }
        }
    }

    fun exportPaymentsToExcel(payments: List<Payment>, summary: PaymentSummary) {
        viewModelScope.launch {
            _exportState.value = ExportState.Loading
            try {
                val exporter = ExcelExporter(context, repository)
                val file = exporter.exportPaymentsToExcel(payments, summary)
                if (file != null) {
                    _exportState.value = ExportState.Success(file)
                } else {
                    _exportState.value = ExportState.Error("Failed to export payment data")
                }
            } catch (e: Exception) {
                _exportState.value = ExportState.Error("Export failed: ${e.message}")
            }
        }
    }

    fun exportLoanTracker() {
        viewModelScope.launch {
            _loanTrackerState.value = LoanTrackerState.Loading
            try {
                val exporter = ExcelExporter(context, repository)
                val file = exporter.exportLoanTracker()
                if (file != null) {
                    _loanTrackerState.value = LoanTrackerState.Success(file)
                } else {
                    _loanTrackerState.value = LoanTrackerState.Error("Failed to export loan tracker")
                }
            } catch (e: Exception) {
                _loanTrackerState.value = LoanTrackerState.Error("Export failed: ${e.message}")
            }
        }
    }

    private fun calculateSummary(payments: List<Payment>): PaymentSummary {
        val totalAmount = payments.sumOf { it.amount }
        val totalPayments = payments.size
        val cashPayments = payments.count { it.paymentMode == "CASH" }
        val phonePayments = payments.count { it.paymentMode == "PHONE" }
        val duePayments = payments.count { it.paymentType == "DUE" }
        
        return PaymentSummary(
            totalAmount = totalAmount,
            totalPayments = totalPayments,
            cashPayments = cashPayments,
            phonePayments = phonePayments,
            duePayments = duePayments
        )
    }

    fun resetStates() {
        _exportState.value = ExportState.Idle
        _reportState.value = ReportState.Idle
        _loanTrackerState.value = LoanTrackerState.Idle
    }
}

sealed class ExportState {
    object Idle : ExportState()
    object Loading : ExportState()
    data class Success(val file: File) : ExportState()
    data class Error(val message: String) : ExportState()
}

sealed class ReportState {
    object Idle : ReportState()
    object Loading : ReportState()
    data class Success(val payments: List<Payment>, val summary: PaymentSummary) : ReportState()
    data class Error(val message: String) : ReportState()
}

sealed class LoanTrackerState {
    object Idle : LoanTrackerState()
    object Loading : LoanTrackerState()
    data class Success(val file: File) : ExportState()
    data class Error(val message: String) : LoanTrackerState()
}

data class PaymentSummary(
    val totalAmount: Double,
    val totalPayments: Int,
    val cashPayments: Int,
    val phonePayments: Int,
    val duePayments: Int
)
