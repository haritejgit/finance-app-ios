package com.example.finance.util

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.example.finance.data.entities.Customer
import com.example.finance.data.entities.Loan
import com.example.finance.data.entities.Payment
import com.example.finance.data.entities.Village
import com.example.finance.data.repository.FinanceRepository
import org.apache.poi.ss.usermodel.*
import org.apache.poi.xssf.usermodel.XSSFColor
import org.apache.poi.xssf.usermodel.XSSFRichTextString
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

class ExcelExporter(private val context: Context, private val repository: FinanceRepository) {

    private fun getStartOfDay(timestamp: Long): Long {
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = timestamp
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }

    private fun getEndOfDay(timestamp: Long): Long {
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = timestamp
        calendar.set(Calendar.HOUR_OF_DAY, 23)
        calendar.set(Calendar.MINUTE, 59)
        calendar.set(Calendar.SECOND, 59)
        calendar.set(Calendar.MILLISECOND, 999)
        return calendar.timeInMillis
    }

    private fun getFirstOccurrenceOfDay(startDate: Long, dayName: String): Long {
        val dayMap = mapOf(
            "Sunday" to Calendar.SUNDAY,
            "Monday" to Calendar.MONDAY,
            "Tuesday" to Calendar.TUESDAY,
            "Wednesday" to Calendar.WEDNESDAY,
            "Thursday" to Calendar.THURSDAY,
            "Friday" to Calendar.FRIDAY,
            "Saturday" to Calendar.SATURDAY
        )
        val targetDay = dayMap[dayName] ?: return startDate
        
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = startDate
        
        // Find the first occurrence of the target day on or after startDate
        while (calendar.get(Calendar.DAY_OF_WEEK) != targetDay) {
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }
        
        return getStartOfDay(calendar.timeInMillis)
    }

    suspend fun exportPaymentsToExcel(startDate: Long, endDate: Long): File? {
        val villages = repository.getAllVillagesList()
        val customers = repository.getAllCustomers()
        val loans = repository.getAllLoans()
        val allPayments = repository.getPaymentsInDateRange(0, Long.MAX_VALUE)
        
        val workbook = XSSFWorkbook()
        
        val orangeColor = XSSFColor(byteArrayOf(0xC5.toByte(), 0x5A.toByte(), 0x11.toByte()), null)
        val purpleColor = XSSFColor(byteArrayOf(0x70.toByte(), 0x30.toByte(), 0xA0.toByte()), null)
        val redColor = IndexedColors.RED.index
        
        // Day Name Style (Row 1)
        val dayNameStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            val font = workbook.createFont().apply { bold = true; fontHeightInPoints = 12.toShort() }
            setFont(font)
        }

        // Header Style (Row 2)
        val headerStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            borderBottom = BorderStyle.THIN
            borderTop = BorderStyle.THIN
            borderLeft = BorderStyle.THIN
            borderRight = BorderStyle.THIN
            fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
            wrapText = true
            val font = workbook.createFont().apply { bold = true }
            setFont(font)
        }

        val standardStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            wrapText = true
        }

        val dueStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            fillForegroundColor = IndexedColors.RED.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
            val font = workbook.createFont().apply { 
                color = IndexedColors.WHITE.index
                bold = true 
            }
            setFont(font)
        }

        // Style for Total Collected (Orange)
        val collectedTotalStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            val font = workbook.createFont().apply { 
                bold = true
                (this as org.apache.poi.xssf.usermodel.XSSFFont).setColor(orangeColor)
            }
            setFont(font)
        }

        // Style for Total Disbursed (Red)
        val disbursedTotalStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            val font = workbook.createFont().apply { 
                bold = true
                color = redColor
            }
            setFont(font)
        }

        val totalLabelStyle = workbook.createCellStyle().apply {
            alignment = HorizontalAlignment.CENTER
            verticalAlignment = VerticalAlignment.CENTER
            val font = workbook.createFont().apply { bold = true }
            setFont(font)
        }

        val orangeFont = workbook.createFont().apply { (this as org.apache.poi.xssf.usermodel.XSSFFont).setColor(orangeColor); bold = true }
        val purpleFont = workbook.createFont().apply { (this as org.apache.poi.xssf.usermodel.XSSFFont).setColor(purpleColor); bold = true }

        val sdf = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault())
        
        val reportStart = getStartOfDay(startDate)
        val reportEnd = getEndOfDay(endDate)

        // Ordered Days: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
        val orderedDays = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

        orderedDays.forEach { dayName ->
            val dayVillages = villages.filter { it.dayOfWeek == dayName }
            val dayCustomers = customers.filter { c -> dayVillages.any { v -> v.id == c.villageId } }
            
            if (dayCustomers.isNotEmpty()) {
                // Calculate week dates SPECIFIC to this day of the week
                val weekDates = mutableListOf<Long>()
                var currentWeek = getFirstOccurrenceOfDay(reportStart, dayName)
                while (currentWeek <= reportEnd) {
                    weekDates.add(currentWeek)
                    val calendar = Calendar.getInstance()
                    calendar.timeInMillis = currentWeek
                    calendar.add(Calendar.DAY_OF_YEAR, 7)
                    currentWeek = calendar.timeInMillis
                }

                if (weekDates.isEmpty()) return@forEach

                val sheet = workbook.createSheet(dayName)
                val row1 = sheet.createRow(0)
                row1.createCell(0).apply {
                    setCellValue(dayName)
                    cellStyle = dayNameStyle
                }
                
                val headerRow = sheet.createRow(1)
                val headers = listOf("ID", "C/O", "Name", "Village, Phone Number and Aadhar")
                headers.forEachIndexed { i, h -> 
                    headerRow.createCell(i).apply { 
                        setCellValue(h)
                        cellStyle = headerStyle
                    }
                }
                
                sheet.setColumnWidth(3, 35 * 256)
                
                weekDates.forEachIndexed { i, date ->
                    headerRow.createCell(4 + i).apply {
                        setCellValue(sdf.format(Date(date)))
                        cellStyle = headerStyle
                    }
                    sheet.setColumnWidth(4 + i, 15 * 256)
                }

                val weeklyDisbursed = DoubleArray(weekDates.size) { 0.0 }
                val weeklyCollected = DoubleArray(weekDates.size) { 0.0 }

                var rowIdx = 2
                dayCustomers.forEach { customer ->
                    val row = sheet.createRow(rowIdx++)
                    row.createCell(0).apply {
                        setCellValue(customer.numericalId.toDouble())
                        cellStyle = standardStyle
                    }
                    row.createCell(1).apply {
                        setCellValue(customer.coId?.toString() ?: "")
                        cellStyle = standardStyle
                    }
                    row.createCell(2).apply {
                        setCellValue(customer.name)
                        cellStyle = standardStyle
                    }
                    
                    val villageName = dayVillages.find { it.id == customer.villageId }?.name ?: ""
                    row.createCell(3).apply {
                        setCellValue("$villageName,\n${customer.phone},\n${customer.aadhar}.")
                        cellStyle = standardStyle
                    }
                    
                    val customerLoans = loans.filter { it.customerId == customer.id }
                    
                    weekDates.forEachIndexed { weekIdx, weekDate ->
                        val cell = row.createCell(4 + weekIdx)
                        cell.cellStyle = standardStyle
                        
                        val startOfWeek = weekDate
                        val endOfWeek = weekDate + 7 * 24 * 60 * 60 * 1000L - 1000L
                        
                        val weekPayments = allPayments.filter { 
                            customerLoans.any { l -> l.id == it.loanId } &&
                            it.paymentDate in startOfWeek..endOfWeek
                        }
                        
                        val loanStartingThisWeek = customerLoans.find { 
                            val loanStartDay = getStartOfDay(it.startDate)
                            loanStartDay >= startOfWeek && loanStartDay <= endOfWeek
                        }
                        
                        if (loanStartingThisWeek != null) {
                            val renewalPayment = weekPayments.find { it.paymentType == "RENEWAL_CLOSURE" }
                            val displayedAmount = loanStartingThisWeek.totalPayable // Cell shows with interest
                            val principalAmount = loanStartingThisWeek.principalAmount
                            val disbursedAmount = principalAmount - (Math.floor(principalAmount / 1000.0) * 20.0)
                            weeklyDisbursed[weekIdx] += disbursedAmount

                            if (renewalPayment != null) {
                                val regularPaymentsSum = weekPayments.filter { it.id != renewalPayment.id && it.paymentType == "REGULAR" }.sumOf { it.amountPaid }
                                val prevBal = renewalPayment.amountPaid + regularPaymentsSum
                                weeklyCollected[weekIdx] += prevBal
                                val prevBalStr = prevBal.toInt().toString()
                                val newAmtStr = displayedAmount.toInt().toString()
                                val richText = XSSFRichTextString("$prevBalStr\n$newAmtStr")
                                richText.applyFont(0, prevBalStr.length, purpleFont)
                                richText.applyFont(prevBalStr.length + 1, richText.length(), orangeFont)
                                cell.setCellValue(richText)
                            } else {
                                val amountStr = displayedAmount.toInt().toString()
                                val richText = XSSFRichTextString(amountStr)
                                richText.applyFont(0, amountStr.length, orangeFont)
                                cell.setCellValue(richText)
                            }
                        } else if (weekPayments.isNotEmpty()) {
                            val regularPayment = weekPayments.filter { it.paymentType == "REGULAR" }.sumOf { it.amountPaid }
                            if (regularPayment > 0) {
                                weeklyCollected[weekIdx] += regularPayment
                                cell.setCellValue(regularPayment)
                            } else if (weekPayments.any { it.paymentType == "DUE" }) {
                                cell.setCellValue("Due")
                                cell.cellStyle = dueStyle
                            }
                        } else {
                            val wasAnyLoanOpen = customerLoans.any { loan ->
                                val startedBefore = getStartOfDay(loan.startDate) <= endOfWeek
                                val notClosedBefore = if (loan.status == "ACTIVE") {
                                    true
                                } else {
                                    val lastPayment = allPayments.filter { it.loanId == loan.id }.maxByOrNull { it.paymentDate }
                                    lastPayment != null && getEndOfDay(lastPayment.paymentDate) >= startOfWeek
                                }
                                startedBefore && notClosedBefore
                            }
                            
                            if (wasAnyLoanOpen) {
                                cell.setCellValue("Due")
                                cell.cellStyle = dueStyle
                            }
                        }
                    }
                }

                // Add Total Rows
                rowIdx++ // Spacer
                
                // First Total Row: Total Collected (Orange)
                val collectedTotalRow = sheet.createRow(rowIdx++)
                collectedTotalRow.createCell(3).apply {
                    setCellValue("TOTAL COLLECTED")
                    cellStyle = totalLabelStyle
                }
                weekDates.forEachIndexed { i, _ ->
                    collectedTotalRow.createCell(4 + i).apply {
                        setCellValue(weeklyCollected[i])
                        cellStyle = collectedTotalStyle
                    }
                }

                // Second Total Row: Total Disbursed (Red)
                val disbursedTotalRow = sheet.createRow(rowIdx++)
                disbursedTotalRow.createCell(3).apply {
                    setCellValue("TOTAL DISBURSED")
                    cellStyle = totalLabelStyle
                }
                weekDates.forEachIndexed { i, _ ->
                    val reducedDisbursed = weeklyDisbursed[i]
                    disbursedTotalRow.createCell(4 + i).apply {
                        setCellValue(reducedDisbursed)
                        cellStyle = disbursedTotalStyle
                    }
                }
            }
        }

        val fileName = "Weekly_Loan_Tracker_${System.currentTimeMillis()}.xlsx"
        return saveWorkbook(workbook, fileName)
    }

    private fun saveWorkbook(workbook: XSSFWorkbook, fileName: String): File? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                uri?.let {
                    context.contentResolver.openOutputStream(it)?.use { os ->
                        workbook.write(os)
                    }
                    workbook.close()
                    File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName)
                }
            } else {
                val file = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName)
                FileOutputStream(file).use { os ->
                    workbook.write(os)
                }
                workbook.close()
                file
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
