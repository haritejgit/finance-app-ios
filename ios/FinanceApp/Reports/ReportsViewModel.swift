import Foundation
import SwiftUI
import Combine

class ReportsViewModel: ObservableObject {
    @Published var exportState: ExportState = .idle
    @Published var reportState: ReportState = .idle
    @Published var loanTrackerState: LoanTrackerState = .idle
    
    private let repository: FinanceRepository
    private let excelExporter: ExcelExporter
    
    init(repository: FinanceRepository, excelExporter: ExcelExporter) {
        self.repository = repository
        self.excelExporter = excelExporter
    }
    
    func generateReport(startDate: Date, endDate: Date) {
        DispatchQueue.main.async {
            self.reportState = .loading
            
            do {
                let payments = try await repository.getPaymentsByDateRange(
                    startDate: Int64(startDate.timeIntervalSince1970),
                    endDate: Int64(endDate.timeIntervalSince1970)
                )
                
                let summary = calculateSummary(payments: payments)
                self.reportState = .success(payments: payments, summary: summary)
            } catch {
                self.reportState = .error("Failed to generate report: \(error.localizedDescription)")
            }
        }
    }
    
    func exportPaymentsToExcel(payments: [Payment], summary: PaymentSummary) {
        DispatchQueue.main.async {
            self.exportState = .loading
            
            do {
                let file = try await excelExporter.exportPaymentsToExcel(
                    payments: payments,
                    summary: summary
                )
                
                if let file = file {
                    self.exportState = .success(file: file)
                } else {
                    self.exportState = .error("Failed to export payment data")
                }
            } catch {
                self.exportState = .error("Export failed: \(error.localizedDescription)")
            }
        }
    }
    
    func exportLoanTracker() {
        DispatchQueue.main.async {
            self.loanTrackerState = .loading
            
            do {
                let file = try await excelExporter.exportLoanTracker()
                
                if let file = file {
                    self.loanTrackerState = .success(file: File)
                } else {
                    self.loanTrackerState = .error("Failed to export loan tracker")
                }
            } catch {
                self.loanTrackerState = .error("Export failed: \(error.localizedDescription)")
            }
        }
    }
    
    func exportWeeklyCollectionReport() {
        DispatchQueue.main.async {
            self.exportState = .loading
            
            do {
                let file = try await excelExporter.exportWeeklyCollectionReport()
                
                if let file = file {
                    self.exportState = .success(file: file)
                } else {
                    self.exportState = .error("Failed to export weekly collection report")
                }
            } catch {
                self.exportState = .error("Export failed: \(error.localizedDescription)")
            }
        }
    }
    
    func resetStates() {
        DispatchQueue.main.async {
            self.exportState = .idle
            self.reportState = .idle
            self.loanTrackerState = .idle
        }
    }
    
    private func calculateSummary(_ payments: [Payment]) -> PaymentSummary {
        let totalAmount = payments.reduce(0) { $0 + $1.amount }
        let totalPayments = payments.count
        let cashPayments = payments.filter { $0.paymentMode == "CASH" }.count
        let phonePayments = payments.filter { $0.paymentMode == "PHONE" }.count
        let duePayments = payments.filter { $0.paymentType == "DUE" }.count
        
        return PaymentSummary(
            totalAmount: totalAmount,
            totalPayments: totalPayments,
            cashPayments: cashPayments,
            phonePayments: phonePayments,
            duePayments: duePayments
        )
    }
}

enum ExportState: Equatable {
    case idle
    case loading
    case success(File)
    case error(String)
}

enum ReportState: Equatable {
    case idle
    case loading
    case success(payments: [Payment], summary: PaymentSummary)
    case error(String)
}

enum LoanTrackerState: Equatable {
    case idle
    case loading
    case success(File)
    case error(String)
}

struct PaymentSummary {
    let totalAmount: Double
    let totalPayments: Int
    let cashPayments: Int
    let phonePayments: Int
    let duePayments: Int
}
