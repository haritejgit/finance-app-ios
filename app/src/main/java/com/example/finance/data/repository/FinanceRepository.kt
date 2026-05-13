package com.example.finance.data.repository

import com.example.finance.auth.AuthManager
import com.example.finance.data.dao.FinanceDao
import com.example.finance.data.entities.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.withContext
import java.util.Calendar
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FinanceRepository @Inject constructor(
    private val dao: FinanceDao,
    private val authManager: AuthManager
) {
    @OptIn(ExperimentalCoroutinesApi::class)
    private val userIdFlow: Flow<String?> = authManager.userFlow.map { it?.uid }.distinctUntilChanged()

    // Village
    @OptIn(ExperimentalCoroutinesApi::class)
    fun getAllVillages(): Flow<List<Village>> {
        return userIdFlow.flatMapLatest { userId ->
            if (userId == null) flowOf(emptyList())
            else dao.getAllVillages(userId)
        }
    }

    suspend fun getAllVillagesList(): List<Village> = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext emptyList()
        dao.getAllVillagesList(userId)
    }

    suspend fun insertVillage(village: Village) = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext
        dao.insertVillage(village.copy(userId = userId))
    }

    suspend fun deleteVillage(village: Village) = withContext(Dispatchers.IO) {
        dao.deleteVillage(village)
    }

    // Customer
    @OptIn(ExperimentalCoroutinesApi::class)
    fun getCustomersByVillage(villageId: String): Flow<List<Customer>> {
        return userIdFlow.flatMapLatest { userId ->
            if (userId == null) flowOf(emptyList())
            else dao.getCustomersByVillage(villageId, userId)
        }
    }

    suspend fun getAllCustomers(): List<Customer> = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext emptyList()
        dao.getAllCustomersList(userId)
    }

    fun getCustomerByIdFlow(customerId: String): Flow<Customer?> {
        return userIdFlow.flatMapLatest { userId ->
            if (userId == null) flowOf(null)
            else dao.getCustomerByIdFlow(customerId, userId)
        }
    }

    suspend fun getCustomerById(customerId: String): Customer? = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext null
        dao.getCustomerById(customerId, userId)
    }

    suspend fun updateCustomer(customer: Customer) = withContext(Dispatchers.IO) {
        dao.updateCustomer(customer)
    }

    suspend fun deleteCustomer(customer: Customer) = withContext(Dispatchers.IO) {
        dao.deleteCustomer(customer)
    }
    
    suspend fun addNewCustomer(customer: Customer, principal: Double, startDate: Long = System.currentTimeMillis()) = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext
        val savedCustomer = customer.copy(userId = userId)
        
        val interest = principal * 0.2
        val total = principal + interest
        val loan = Loan(
            customerId = savedCustomer.id,
            principalAmount = principal,
            interestAmount = interest,
            totalPayable = total,
            balanceAmount = total,
            startDate = startDate,
            userId = userId
        )
        dao.insertCustomerAndLoan(savedCustomer, loan)
    }

    suspend fun getNextNumericalId(villageId: String): Int = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext 1
        val village = dao.getVillageById(villageId, userId) ?: return@withContext 1
        
        val assignedIds = dao.getNumericalIdsForShift(userId, village.dayOfWeek, village.shift).toSet()
        var nextId = 1
        while (assignedIds.contains(nextId)) {
            nextId += 1
        }
        return@withContext nextId
    }

    suspend fun getVillageById(villageId: String): Village? = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext null
        dao.getVillageById(villageId, userId)
    }
    
    private fun getStartOfDay(timestamp: Long): Long {
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = timestamp
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }

    // Loan & Payments
    @OptIn(ExperimentalCoroutinesApi::class)
    fun getActiveLoan(customerId: String): Flow<Loan?> {
        return userIdFlow.flatMapLatest { userId ->
            if (userId == null) flowOf(null)
            else dao.getActiveLoanByCustomer(customerId, userId)
        }
    }

    suspend fun getAllLoans(): List<Loan> = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext emptyList()
        dao.getAllLoansList(userId)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    fun getPaymentsForLoan(loanId: String): Flow<List<Payment>> {
        return userIdFlow.flatMapLatest { userId ->
            if (userId == null) flowOf(emptyList())
            else dao.getPaymentsByLoan(loanId, userId)
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    fun getAllPaymentsForCustomer(customerId: String): Flow<List<PaymentWithLoanInfo>> {
        return userIdFlow.flatMapLatest { userId ->
            if (userId == null) flowOf(emptyList())
            else dao.getAllPaymentsForCustomer(customerId, userId)
        }
    }

    suspend fun addPayment(loan: Loan, amount: Double, date: Long, mode: String = "CASH") = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext
        val payment = Payment(
            loanId = loan.id,
            amountPaid = amount,
            paymentDate = date,
            weekNumber = 0,
            paymentType = "REGULAR",
            paymentMode = mode,
            userId = userId
        )
        dao.recordPaymentAndUpdateLoan(payment, loan.id, amount)
    }
    
    suspend fun updatePayment(payment: Payment, newAmount: Double, newDate: Long, newMode: String = "CASH") = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext
        val oldAmount = payment.amountPaid
        val updatedPayment = payment.copy(amountPaid = newAmount, paymentDate = newDate, paymentMode = newMode)
        dao.updatePayment(updatedPayment)
        
        val loan = dao.getLoanById(payment.loanId, userId)
        loan?.let {
            val balanceDiff = oldAmount - newAmount
            val newBalance = it.balanceAmount + balanceDiff
            dao.updateLoan(it.copy(balanceAmount = newBalance))
        }
    }

    suspend fun deletePayment(payment: Payment) = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext
        dao.deletePayment(payment)
        
        val loan = dao.getLoanById(payment.loanId, userId)
        loan?.let {
            val newBalance = it.balanceAmount + payment.amountPaid
            dao.updateLoan(it.copy(balanceAmount = newBalance))
        }
    }

    suspend fun markDue(loan: Loan, date: Long) = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext
        val payment = Payment(
            loanId = loan.id,
            amountPaid = 0.0,
            paymentDate = date,
            weekNumber = 0,
            paymentType = "DUE",
            userId = userId
        )
        dao.insertPayment(payment)
    }

    suspend fun renewLoan(oldLoan: Loan, newPrincipal: Double, date: Long) = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext
        
        val closingAmount = oldLoan.balanceAmount
        if (closingAmount > 0) {
            val closingPayment = Payment(
                loanId = oldLoan.id,
                amountPaid = closingAmount,
                paymentDate = date,
                weekNumber = 0,
                paymentType = "RENEWAL_CLOSURE",
                notes = "Loan renewed - old balance cleared",
                userId = userId
            )
            dao.insertPayment(closingPayment)
        }
        
        dao.updateLoan(oldLoan.copy(balanceAmount = 0.0, status = "RENEWED"))
        
        val newInterest = newPrincipal * 0.2
        val newTotal = newPrincipal + newInterest
        
        val newLoan = Loan(
            customerId = oldLoan.customerId,
            principalAmount = newPrincipal,
            interestAmount = newInterest,
            totalPayable = newTotal,
            balanceAmount = newTotal,
            startDate = date,
            userId = userId
        )
        dao.insertLoan(newLoan)
    }

    suspend fun getDetailedPaymentsInDateRange(startDate: Long, endDate: Long): List<PaymentReport> = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext emptyList()
        dao.getDetailedPaymentsInDateRange(userId, startDate, endDate)
    }

    fun getVillageCollectionToday(villageId: String): Flow<Double> {
        return userIdFlow.flatMapLatest { userId ->
            if (userId == null) flowOf(0.0)
            else {
                val startOfDay = getStartOfDay(System.currentTimeMillis())
                dao.getVillageCollectionToday(villageId, userId, startOfDay).map { it ?: 0.0 }
            }
        }
    }

    suspend fun getPaymentsInDateRange(startDate: Long, endDate: Long): List<Payment> = withContext(Dispatchers.IO) {
        val userId = authManager.getCurrentUserId() ?: return@withContext emptyList()
        dao.getPaymentsInDateRange(userId, startDate, endDate)
    }
}
