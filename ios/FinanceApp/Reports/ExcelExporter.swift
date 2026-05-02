import Foundation
import UniformTypeIdentifiers

class ExcelExporter {
    private let context: UIViewController
    private let repository: FinanceRepository
    
    init(context: UIViewController, repository: FinanceRepository) {
        self.context = context
        self.repository = repository
    }
    
    func exportPaymentsToExcel(payments: [Payment], summary: PaymentSummary) async throws -> URL? {
        let villages = try await repository.getAllVillages()
        let customers = try await repository.getAllCustomers()
        let loans = try await repository.getAllLoans()
        
        let workbook = createWorkbook()
        
        // Create Payments sheet
        let paymentData = payments.map { payment in
            return [
                DateFormatter.localizedString(from: payment.paymentDate, dateStyle: .short)
                    ?? "Unknown",
                String(payment.amount),
                payment.paymentType,
                payment.paymentMode,
                payment.customerId ?? ""
            ]
        }
        
        let paymentsSheet = createSheet(
            workbook: workbook,
            title: "Payments",
            data: paymentData,
            headers: ["Date", "Amount", "Type", "Mode", "Customer ID"]
        )
        
        // Create Summary sheet
        let summaryData = [
            ["Total Payments", String(summary.totalPayments)],
            ["Total Amount", String(format: "Rs.%.2f", summary.totalAmount)],
            ["Cash Payments", String(summary.cashPayments)],
            ["Phone Payments", String(summary.phonePayments)],
            ["Due Payments", String(summary.duePayments)],
            ["Report Generated", DateFormatter.localizedString(from: Date(), dateStyle: .medium) ?? ""],
            ["Report Period", "\(DateFormatter.string(from: payments.first?.paymentDate ?? Date(), dateFormat: "yyyy-MM-dd")) to \(DateFormatter.string(from: payments.last?.paymentDate ?? Date(), dateFormat: "yyyy-MM-dd"))"]
        ]
        
        let summarySheet = createSheet(
            workbook: workbook,
            title: "Summary",
            data: summaryData,
            headers: ["Metric", "Value"]
        )
        
        // Create Charts Data sheet
        let chartData = [
            ["Cash", String(summary.cashPayments), String(payments.filter { $0.paymentMode == "CASH" }.reduce(0) { $0 + $1.amount })],
            ["Phone", String(summary.phonePayments), String(payments.filter { $0.paymentMode == "PHONE" }.reduce(0) { $0 + $1.amount })],
            ["Regular", String(payments.filter { $0.paymentType == "REGULAR" }.count), String(payments.filter { $0.paymentType == "REGULAR" }.reduce(0) { $0 + $1.amount })],
            ["Due", String(summary.duePayments), String(payments.filter { $0.paymentType == "DUE" }.reduce(0) { $0 + $1.amount })]
        ]
        
        let chartSheet = createSheet(
            workbook: workbook,
            title: "Charts Data",
            data: chartData,
            headers: ["Payment Type", "Count", "Amount"]
        )
        
        return try saveWorkbook(workbook: workbook, fileName: "payment_report_\(DateFormatter.string(from: Date(), dateFormat: "yyyy-MM-dd")).xlsx")
    }
    
    func exportWeeklyCollectionReport() async throws -> URL? {
        let villages = try await repository.getAllVillages()
        let customers = try await repository.getAllCustomers()
        let loans = try await repository.getAllLoans()
        let allPayments = try await repository.getPaymentsInDateRange(0, Int64.max)
        
        let workbook = createWorkbook()
        
        // Color definitions
        let orangeColor = "#C55A11"
        let blackColor = "#000000"
        let redColor = "#FF0000"
        let purpleColor = "#7030A0"
        let whiteColor = "#FFFFFF"
        let lightGrayColor = "#F0F0F0"
        let mediumGrayColor = "#E0E0E0"
        
        // Bold font for headers
        let boldFont = createFont(weight: .bold)
        let standardFont = createFont()
        
        // Day sheets: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
        let daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        
        for (index, dayName) in daysOfWeek.enumerated() {
            let sheet = workbook.createSheet(dayName)
            
            // Row 1: Day Name (BOLD)
            let dayNameRow = sheet.createRow(0)
            let dayNameCell = dayNameRow.createCell(0)
            dayNameCell.setCellValue(dayName)
            dayNameCell.setCellStyle(createCellStyle(
                font: boldFont,
                alignment: .center,
                fillForegroundColor: lightGrayColor
            ))
            
            // Row 2: Column Headers (BOLD)
            let headerRow = sheet.createRow(1)
            let headers = ["ID", "C/O", "Name", "Village, Phone Number and Aadhar"]
            
            headers.enumerated().forEach { index, header in
                let headerCell = headerRow.createCell(index)
                headerCell.setCellValue(header)
                headerCell.setCellStyle(createCellStyle(
                    font: boldFont,
                    alignment: .center,
                    fillForegroundColor: mediumGrayColor
                ))
            }
            
            // Filter data for this specific day
            let dayPayments = allPayments.filter { payment in
                let paymentDate = Date(timeIntervalSince1970: payment.paymentDate)
                let calendar = Calendar.current
                calendar.timeIntervalSince1970 = paymentDate
                let dayOfWeek = calendar.component(.weekday)!
                let dayName = calendar.weekdaySymbols[dayOfWeek - 1]
                return dayName == dayName
            }
            
            // Group payments by customer for this day
            let customerDayPayments = Dictionary.grouping(by: dayPayments) { payments in
                return payments.first?.customerId ?? "unknown"
            }
            
            var rowIndex = 2
            var totalCollected = 0.0
            var totalDisbursed = 0.0
            
            // Add customer data for this day
            for (customerId, payments) in customerDayPayments {
                if let customer = customers.first(where: { $0.id == customerId }) {
                    var customerRow: [String] = [customer.id, "", customer.name]
                    
                    // Add village info
                    let villageName = villages.first(where: { $0.id == customer.villageId })?.name ?? ""
                    customerRow.append("\(villageName),\n\(customer.phone),\n\(customer.aadhar)")
                    
                    // Add payment data for each week column
                    for payment in payments {
                        let paymentDate = Date(timeIntervalSince1970: payment.paymentDate)
                        let calendar = Calendar.current
                        calendar.timeIntervalSince1970 = paymentDate
                        let weekOfMonth = calendar.component(.weekOfMonth)
                        let weekDate = getWeekDate(for: paymentDate, dayIndex: weekOfMonth - 1)
                        
                        let cellValue: String
                        let cellStyle: CellStyle
                        
                        switch payment.paymentType {
                        case "DISBURSEMENT":
                            cellValue = String(payment.amount)
                            cellStyle = createCellStyle(fontColor: orangeColor, alignment: .center)
                            totalDisbursed += payment.amount
                        case "REGULAR":
                            cellValue = String(payment.amount)
                            cellStyle = createCellStyle(fontColor: blackColor, alignment: .center)
                            totalCollected += payment.amount
                        case "DUE":
                            cellValue = "Due"
                            cellStyle = createCellStyle(
                                fontColor: whiteColor,
                                fillColor: redColor,
                                alignment: .center
                            )
                        case "RENEWAL_CLOSURE":
                            if let loan = loans.first(where: { $0.id == payment.loanId }) {
                                let remaining = loan.totalPayable - payment.amountPaid
                                cellValue = "\(remaining)\n\(payment.amount)"
                                cellStyle = createCellStyle(fontColor: purpleColor, alignment: .center)
                            } else {
                                cellValue = String(payment.amount)
                                cellStyle = createCellStyle(fontColor: orangeColor, alignment: .center)
                            }
                        default:
                            cellValue = String(payment.amount)
                            cellStyle = createCellStyle(fontColor: blackColor, alignment: .center)
                        }
                        
                        customerRow.append(cellValue)
                    }
                    
                    // Add row to sheet
                    let dataRow = sheet.createRow(rowIndex)
                    customerRow.enumerated().forEach { index, value in
                        let cell = dataRow.createCell(index)
                        cell.setCellValue(value)
                        
                        // Apply appropriate style based on payment type
                        if index >= 3 { // Payment data columns
                            if let payment = payments.first(where: { 
                                let paymentCalendar = Calendar.current
                                paymentCalendar.timeIntervalSince1970 = $0.paymentDate
                                let paymentWeekOfMonth = paymentCalendar.component(.weekOfMonth)
                                let weekDate = getWeekDate(for: $0.paymentDate, dayIndex: paymentWeekOfMonth - 1)
                                return DateFormatter.string(from: weekDate, dateFormat: "dd-MM-yyyy") == DateFormatter.string(from: weekDate, dateFormat: "dd-MM-yyyy")
                            }) {
                                cell.setCellStyle(getPaymentCellStyle(for: payment))
                            }
                        } else if index == 2 { // Village column
                            cell.setCellStyle(createCellStyle(alignment: .center))
                        } else { // ID and Name columns
                            cell.setCellStyle(createCellStyle(alignment: .center))
                        }
                    }
                    
                    sheet.createRow(rowIndex)
                    rowIndex += 1
                }
                
                // Add totals at the bottom
                let totalRow = sheet.createRow(rowIndex)
                
                // TOTAL COLLECTED (Orange text)
                let totalCollectedCell = totalRow.createCell(3)
                totalCollectedCell.setCellValue("TOTAL COLLECTED")
                totalCollectedCell.setCellStyle(createCellStyle(
                    fontColor: orangeColor,
                    font: boldFont,
                    alignment: .center
                ))
                
                let totalCollectedValueCell = totalRow.createCell(4)
                totalCollectedValueCell.setCellValue(String(format: "%.2f", totalCollected))
                totalCollectedValueCell.setCellStyle(createCellStyle(fontColor: orangeColor, alignment: .center))
                
                // TOTAL DISBURSED (Red text)
                let totalDisbursedCell = totalRow.createCell(5)
                totalDisbursedCell.setCellValue("TOTAL DISBURSED")
                totalDisbursedCell.setCellStyle(createCellStyle(
                    fontColor: redColor,
                    font: boldFont,
                    alignment: .center
                ))
                
                let totalDisbursedValueCell = totalRow.createCell(6)
                totalDisbursedValueCell.setCellValue(String(format: "%.2f", totalDisbursed - (totalDisbursed * 0.02)))
                totalDisbursedValueCell.setCellStyle(createCellStyle(fontColor: redColor, alignment: .center))
            }
            
            // Set column widths
            sheet.setColumnWidth(0, 8 * 256)    // ID
            sheet.setColumnWidth(1, 8 * 256)    // C/O
            sheet.setColumnWidth(2, 20 * 256)   // Name
            sheet.setColumnWidth(3, 35 * 256)   // Village, Phone Number and Aadhar
            
            // Set widths for payment columns
            for i in 4..<12 {
                sheet.setColumnWidth(i, 12 * 256)
            }
        }
        
        return try saveWorkbook(workbook: fileName: "Weekly_Collection_Report_\(DateFormatter.string(from: Date(), dateFormat: "yyyy-MM-dd")).xlsx")
    }
    
    func exportLoanTracker() async throws -> URL? {
        let villages = try await repository.getAllVillages()
        let customers = try await repository.getAllCustomers()
        let loans = try await repository.getAllLoans()
        
        let workbook = createWorkbook()
        
        let orangeColor = "#C55A11"
        let blackColor = "#000000"
        let redColor = "#FF0000"
        let purpleColor = "#7030A0"
        let lightGrayColor = "#F0F0F0"
        let mediumGrayColor = "#E0E0E0"
        
        var loanData: [[String]] = []
        
        loanData.append(["Sunday", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
        
        var headers = ["ID", "C/O", "Name", "Village, Phone Number and Aadhar"]
        
        let startDate = Calendar.current.date(byAdding: .day, value: -365) // March 15, 2026
        let endDate = Calendar.current.date(byAdding: .day, value: -270) // May 17, 2026
        var currentDate = startDate
        
        while currentDate <= endDate {
            let formattedDate = DateFormatter.string(from: currentDate, dateFormat: "dd-MM-yyyy")
            headers.append(formattedDate)
            currentDate = Calendar.current.date(byAdding: .day, value: 7)
        }
        
        loanData.append(headers)
        
        let sampleCustomers = [
            CustomerRow(
                id: "1",
                co: "",
                name: "Hari",
                village: "Gondia,\n7032354284,\n650694503953.",
                weeklyData: [
                    WeeklyPayment(date: "15-03-2026", type: .disbursement, amount: 6000),
                    WeeklyPayment(date: "22-03-2026", type: .due, amount: 0),
                    WeeklyPayment(date: "29-03-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "05-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "12-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "19-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "26-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "03-05-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "10-05-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "17-05-2026", type: .renewal, amount: 3500, previousBalance: 3500, newLoan: 12000)
                ]
            ),
            
            CustomerRow(
                id: "2",
                co: "",
                name: "Customer 2",
                village: "Village 2,\nPhone 2,\nAadhar 2",
                weeklyData: [
                    WeeklyPayment(date: "15-03-2026", type: .disbursement, amount: 5000),
                    WeeklyPayment(date: "22-03-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "29-03-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "05-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "12-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "19-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "26-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "03-05-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "10-05-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "17-05-2026", type: .renewal, amount: 5000, previousBalance: 5000, newLoan: 5000)
                ]
            ),
            
            CustomerRow(
                id: "3",
                co: "",
                name: "Customer 3",
                village: "Village 3,\nPhone 3,\nAadhar 3",
                weeklyData: [
                    WeeklyPayment(date: "15-03-2026", type: .disbursement, amount: 5000),
                    WeeklyPayment(date: "22-03-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "29-03-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "05-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "12-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "19-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "26-04-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "03-05-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "10-05-2026", type: .payment, amount: 500),
                    WeeklyPayment(date: "17-05-2026", type: .renewal, amount: 7000, previousBalance: 7000, newLoan: 7000)
                ]
            )
        ]
        
        for customer in sampleCustomers {
            var customerRow: [String] = [customer.id, customer.co, customer.name, customer.village]
            
            for weekData in customer.weeklyData {
                let cellValue: String
                switch weekData.type {
                case .disbursement:
                    cellValue = String(weekData.amount)
                case .payment:
                    cellValue = String(weekData.amount)
                case .due:
                    cellValue = "Due"
                case .renewal:
                    cellValue = "\(weekData.previousBalance)\n\(weekData.amount)"
                }
                
                customerRow.append(cellValue)
            }
            
            loanData.append(customerRow)
        }
        
        let sheet = createSheet(
            workbook: workbook,
            title: "Loan Tracker",
            data: loanData,
            headers: headers
        )
        
        return try saveWorkbook(workbook: workbook, fileName: "Loan_Collection_Tracker_\(DateFormatter.string(from: Date(), dateFormat: "yyyy-MM-dd")).xlsx")
    }
    
    // MARK: - Private Helper Methods
    
    private func createWorkbook() -> [[String]] {
        return [[""]] // Empty workbook representation
    }
    
    private func createSheet(
        workbook: [[String]],
        title: String,
        data: [[String]],
        headers: [String]
    ) -> [[String]] {
        var sheet: [[String]] = []
        
        // Add title row (optional)
        if !title.isEmpty {
            sheet.append([title] + Array(repeating: "", count: headers.count))
        }
        
        // Add headers
        sheet.append(headers)
        
        // Add data
    }
            throw ExcelExporterError.failedToCreateData
        }
        
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        
        do {
            try data.write(to: tempURL)
            
            // Share the file
            let activityViewController = UIActivityViewController(
                activityItems: [tempURL],
                applicationActivities: nil
            )
            
            if let windowScene = context.view.window?.windowScene {
                windowScene.keyWindow?.rootViewController?.present(activityViewController, animated: true)
            } else {
                context.present(activityViewController, animated: true)
            }
            
            return tempURL
        } catch {
            throw ExcelExporterError.failedToSaveFile
        }
    }
    
    private func convertToCSV(_ workbook: [[String]]) -> String {
        return workbook.map { row in
            row.joined(separator: ",")
        }.joined(separator: "\n")
    }
}

// MARK: - Supporting Types

struct CustomerRow {
    let id: String
    let co: String
    let name: String
    let village: String
    let weeklyData: [WeeklyPayment]
}

struct WeeklyPayment {
    let date: String
    let type: PaymentType
    let amount: Double
    let previousBalance: Double
    let newLoan: Double
}

enum PaymentType {
    case disbursement
    case payment
    case due
    case renewal
}

enum ExcelExporterError: LocalizedError {
    case failedToCreateData
    case failedToSaveFile
    case failedToShareFile
    
    var errorDescription: String {
        switch self {
        case .failedToCreateData:
            return "Failed to create Excel data"
        case .failedToSaveFile:
            return "Failed to save Excel file"
        case .failedToShareFile:
            return "Failed to share Excel file"
        }
    }
}
