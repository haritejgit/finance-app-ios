package com.example.finance.data.dao

import androidx.room.*
import com.example.finance.data.entities.*
import kotlinx.coroutines.flow.Flow

@Dao
interface FinanceDao {

    // Village
    @Query("SELECT * FROM villages WHERE userId = :userId")
    fun getAllVillages(userId: String): Flow<List<Village>>

    @Query("SELECT * FROM villages WHERE userId = :userId")
    suspend fun getAllVillagesList(userId: String): List<Village>

    @Query("SELECT * FROM villages WHERE id = :villageId AND userId = :userId")
    suspend fun getVillageById(villageId: String, userId: String): Village?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVillage(village: Village)

    @Update
    suspend fun updateVillage(village: Village)

    @Delete
    suspend fun deleteVillage(village: Village)

    // Customer
    @Query("SELECT * FROM customers WHERE villageId = :villageId AND userId = :userId AND isActive = 1")
    fun getCustomersByVillage(villageId: String, userId: String): Flow<List<Customer>>

    @Query("SELECT * FROM customers WHERE userId = :userId AND isActive = 1")
    suspend fun getAllCustomersList(userId: String): List<Customer>

    @Query("SELECT * FROM customers WHERE id = :customerId AND userId = :userId")
    suspend fun getCustomerById(customerId: String, userId: String): Customer?

    @Query("SELECT * FROM customers WHERE id = :customerId AND userId = :userId")
    fun getCustomerByIdFlow(customerId: String, userId: String): Flow<Customer?>

    @Query("""
        SELECT MAX(c.numericalId) 
        FROM customers c 
        JOIN villages v ON c.villageId = v.id 
        WHERE v.dayOfWeek = :day AND v.shift = :shift AND c.userId = :userId
    """)
    suspend fun getMaxNumericalIdForShift(userId: String, day: String, shift: String): Int?

    @Query("""
        SELECT c.numericalId
        FROM customers c
        JOIN villages v ON c.villageId = v.id
        WHERE v.dayOfWeek = :day AND v.shift = :shift AND c.userId = :userId
    """)
    suspend fun getNumericalIdsForShift(userId: String, day: String, shift: String): List<Int>

    @Query("SELECT numericalId FROM customers WHERE villageId = :villageId AND userId = :userId AND isActive = 1")
    suspend fun getNumericalIdsForVillage(userId: String, villageId: String): List<Int>

    @Query("SELECT MAX(numericalId) FROM customers WHERE userId = :userId")
    suspend fun getMaxNumericalId(userId: String): Int?

    @Query("SELECT MAX(numericalId) FROM customers WHERE userId = :userId AND createdAt >= :startOfDay")
    suspend fun getMaxNumericalIdForDate(userId: String, startOfDay: Long): Int?

    @Query("SELECT numericalId FROM customers WHERE userId = :userId AND isActive = 0 ORDER BY numericalId ASC LIMIT 1")
    suspend fun getSmallestAvailableNumericalId(userId: String): Int?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCustomer(customer: Customer)

    @Update
    suspend fun updateCustomer(customer: Customer)

    @Delete
    suspend fun deleteCustomer(customer: Customer)

    @Transaction
    suspend fun insertCustomerAndLoan(customer: Customer, loan: Loan) {
        insertCustomer(customer)
        insertLoan(loan)
    }

    // Loan
    @Query("SELECT * FROM loans WHERE customerId = :customerId AND userId = :userId AND status = 'ACTIVE' LIMIT 1")
    fun getActiveLoanByCustomer(customerId: String, userId: String): Flow<Loan?>

    @Query("SELECT * FROM loans WHERE userId = :userId")
    suspend fun getAllLoansList(userId: String): List<Loan>

    @Query("SELECT * FROM loans WHERE customerId = :customerId AND userId = :userId ORDER BY startDate DESC")
    fun getAllLoansByCustomer(customerId: String, userId: String): Flow<List<Loan>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLoan(loan: Loan)

    @Update
    suspend fun updateLoan(loan: Loan)

    @Query("SELECT * FROM loans WHERE id = :loanId AND userId = :userId")
    suspend fun getLoanById(loanId: String, userId: String): Loan?

    @Query("""
        SELECT p.*, l.status as loanStatus, l.startDate as loanStartDate 
        FROM payments p
        JOIN loans l ON p.loanId = l.id
        WHERE l.customerId = :customerId AND p.userId = :userId
        ORDER BY p.paymentDate DESC
    """)
    fun getAllPaymentsForCustomer(customerId: String, userId: String): Flow<List<PaymentWithLoanInfo>>

    @Transaction
    suspend fun recordPaymentAndUpdateLoan(payment: Payment, loanId: String, amount: Double) {
        insertPayment(payment)
        val loan = getLoanById(loanId, payment.userId)
        loan?.let {
            val newBalance = it.balanceAmount - amount
            if (newBalance <= 0) {
                updateLoan(it.copy(balanceAmount = 0.0, status = "CLOSED"))
            } else {
                updateLoan(it.copy(balanceAmount = newBalance))
            }
        }
    }

    // Payment
    @Query("SELECT * FROM payments WHERE loanId = :loanId AND userId = :userId ORDER BY paymentDate DESC")
    fun getPaymentsByLoan(loanId: String, userId: String): Flow<List<Payment>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPayment(payment: Payment)

    @Update
    suspend fun updatePayment(payment: Payment)

    @Delete
    suspend fun deletePayment(payment: Payment)

    @Query("""
        SELECT p.paymentDate, p.amountPaid, c.name as customerName, v.name as villageName, c.numericalId, c.coId, p.paymentType, p.notes
        FROM payments p
        JOIN loans l ON p.loanId = l.id
        JOIN customers c ON l.customerId = c.id
        JOIN villages v ON c.villageId = v.id
        WHERE p.userId = :userId AND p.paymentDate BETWEEN :startDate AND :endDate
    """)
    suspend fun getDetailedPaymentsInDateRange(userId: String, startDate: Long, endDate: Long): List<PaymentReport>

    @Query("SELECT * FROM payments WHERE userId = :userId AND paymentDate BETWEEN :startDate AND :endDate")
    suspend fun getPaymentsInDateRange(userId: String, startDate: Long, endDate: Long): List<Payment>

    @Query("""
        SELECT SUM(p.amountPaid) 
        FROM payments p
        JOIN loans l ON p.loanId = l.id
        JOIN customers c ON l.customerId = c.id
        WHERE c.villageId = :villageId AND p.userId = :userId AND p.paymentDate >= :startOfDay
    """)
    fun getVillageCollectionToday(villageId: String, userId: String, startOfDay: Long): Flow<Double?>
}
