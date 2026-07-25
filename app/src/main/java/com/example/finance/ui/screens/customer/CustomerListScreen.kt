package com.example.finance.ui.screens.customer

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.finance.data.entities.Customer
import com.example.finance.ui.theme.PaidGreen
import com.google.android.gms.location.LocationServices
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerListScreen(
    villageId: String,
    onNavigateToProfile: (String) -> Unit,
    viewModel: CustomerViewModel = hiltViewModel()
) {
    LaunchedEffect(villageId) { viewModel.setVillageId(villageId) }
    
    val customers by viewModel.customers.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var showAddDialog by remember { mutableStateOf(false) }

    val filteredCustomers = remember(customers, searchQuery) {
        if (searchQuery.isBlank()) customers else {
            customers.filter { customer ->
                customer.name.contains(searchQuery, ignoreCase = true) ||
                customer.numericalId.toString() == searchQuery ||
                customer.coId?.toString() == searchQuery ||
                customer.phone.contains(searchQuery) ||
                (customer.coName?.contains(searchQuery, ignoreCase = true) ?: false)
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF1E88E5), Color(0xFF1565C0))
                )
            )
    ) {
        Scaffold(
            topBar = { 
                TopAppBar(
                    title = {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Search customers...", color = Color.White.copy(alpha = 0.6f)) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(end = 16.dp)
                                .height(52.dp),
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color.White) },
                            trailingIcon = {
                                if (searchQuery.isNotEmpty()) {
                                    IconButton(onClick = { searchQuery = "" }) {
                                        Icon(Icons.Default.Close, contentDescription = null, tint = Color.White)
                                    }
                                }
                            },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color.White,
                                unfocusedBorderColor = Color.White.copy(alpha = 0.4f),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                cursorColor = Color.White,
                                selectionColors = TextSelectionColors(handleColor = Color.White, backgroundColor = Color.White.copy(alpha = 0.4f))
                            ),
                            shape = RoundedCornerShape(26.dp),
                            singleLine = true
                        )
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        titleContentColor = Color.White
                    )
                )
            },
            containerColor = Color.Transparent,
            floatingActionButton = {
                ExtendedFloatingActionButton(
                    onClick = { showAddDialog = true },
                    containerColor = Color.White,
                    contentColor = Color(0xFF1565C0),
                    shape = CircleShape,
                    modifier = Modifier.padding(bottom = 16.dp, end = 8.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("ADD CUSTOMER", fontWeight = FontWeight.Bold)
                }
            }
        ) { padding ->
            if (filteredCustomers.isEmpty()) {
                EmptyCustomerState(padding, searchQuery.isNotEmpty())
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredCustomers, key = { it.id }) { customer ->
                        CustomerItem(
                            customer = customer,
                            onClick = { onNavigateToProfile(customer.id) }
                        )
                    }
                    item { Spacer(modifier = Modifier.height(80.dp)) }
                }
            }
        }

        if (showAddDialog) {
            AddCustomerDialog(
                onDismiss = { showAddDialog = false },
                onAdd = { name, phone, aadhar, location, co, coId, principal, startDate, lat, lng ->
                    viewModel.addCustomer(name, phone, aadhar, location, co, coId, principal, startDate, lat, lng)
                    showAddDialog = false
                }
            )
        }
    }
}

@Composable
fun CustomerItem(
    customer: Customer,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                modifier = Modifier.size(50.dp),
                shape = CircleShape,
                color = Color(0xFF1565C0).copy(alpha = 0.1f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = customer.numericalId.toString(),
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF1565C0)
                        )
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = customer.name,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF333333)
                    )
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Phone, contentDescription = null, modifier = Modifier.size(14.dp), tint = Color.Gray)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = customer.phone,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray
                    )
                    if (!customer.coName.isNullOrBlank()) {
                        Text(
                            text = " - C/O: ${customer.coName}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray
                        )
                    }
                }
                
                if (customer.latitude != null && customer.longitude != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 4.dp)
                    ) {
                        Icon(
                            Icons.Default.LocationOn,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = Color(0xFF4CAF50)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Location Tagged",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF4CAF50),
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
            
            Icon(
                Icons.AutoMirrored.Filled.ArrowForwardIos,
                contentDescription = null,
                tint = Color.LightGray,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
fun EmptyCustomerState(paddingValues: PaddingValues, isSearching: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(paddingValues),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = if (isSearching) Icons.Default.SearchOff else Icons.Default.PersonAdd,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = Color.White.copy(alpha = 0.5f)
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = if (isSearching) "No matching customers" else "No Customers Yet",
            style = MaterialTheme.typography.headlineSmall.copy(
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        )
        Text(
            text = if (isSearching) "Try a different search term" else "Tap the button below to add your first customer to this village.",
            style = MaterialTheme.typography.bodyMedium.copy(
                color = Color.White.copy(alpha = 0.7f)
            ),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 48.dp, vertical = 8.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCustomerDialog(
    onDismiss: () -> Unit,
    onAdd: (String, String, String, String, String, Int?, Double, Long, Double?, Double?) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var aadhar by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var co by remember { mutableStateOf("") }
    var coId by remember { mutableStateOf("") }
    var principal by remember { mutableStateOf("") }
    var selectedLocation by remember { mutableStateOf<LatLng?>(null) }
    var showMapPicker by remember { mutableStateOf(false) }
    
    var showDatePicker by remember { mutableStateOf(false) }
    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis())
    val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())

    val context = LocalContext.current
    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }

    @SuppressLint("MissingPermission")
    fun captureCurrentLocation() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) {
                    selectedLocation = LatLng(loc.latitude, loc.longitude)
                }
            }
        }
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted -> if (isGranted) captureCurrentLocation() }
    )

    if (showMapPicker) {
        MapPicker(
            onLocationSelected = {
                selectedLocation = it
                showMapPicker = false
            },
            onDismiss = { showMapPicker = false }
        )
    }
    
    if (showDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = { TextButton(onClick = { showDatePicker = false }) { Text("OK") } }
        ) { DatePicker(state = datePickerState) }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Customer Registration", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()).fillMaxWidth()) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Customer Name") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone Number") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = aadhar, onValueChange = { aadhar = it }, label = { Text("Aadhar Number") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = location, onValueChange = { location = it }, label = { Text("Location Description") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                
                Spacer(modifier = Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = co, onValueChange = { co = it }, label = { Text("C/O Name") }, modifier = Modifier.weight(1.5f), shape = RoundedCornerShape(12.dp))
                    OutlinedTextField(value = coId, onValueChange = { coId = it }, label = { Text("C/O ID") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number))
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = principal, onValueChange = { principal = it }, label = { Text("Principal Amount (₹)") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal))
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text("Money Taken Date", style = MaterialTheme.typography.labelMedium, color = Color.Gray)
                OutlinedCard(
                    onClick = { showDatePicker = true },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.DateRange, contentDescription = null, modifier = Modifier.size(20.dp), tint = Color(0xFF1E88E5))
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(sdf.format(Date(datePickerState.selectedDateMillis ?: System.currentTimeMillis())))
                    }
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Button(
                    onClick = { 
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                            captureCurrentLocation()
                        } else {
                            launcher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (selectedLocation != null) PaidGreen else MaterialTheme.colorScheme.primary
                    )
                ) {
                    Icon(if (selectedLocation != null) Icons.Default.CheckCircle else Icons.Default.LocationOn, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (selectedLocation != null) "Location Captured" else "Tag Current Location")
                }
                
                if (selectedLocation == null) {
                    TextButton(onClick = { showMapPicker = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Text("Pick manually from Map")
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { 
                    onAdd(name, phone, aadhar, location, co, coId.toIntOrNull(), principal.toDoubleOrNull() ?: 0.0, datePickerState.selectedDateMillis ?: System.currentTimeMillis(), selectedLocation?.latitude, selectedLocation?.longitude)
                },
                enabled = name.isNotBlank() && phone.isNotBlank() && principal.isNotBlank(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Register Customer")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        shape = RoundedCornerShape(24.dp)
    )
}

@SuppressLint("MissingPermission")
@Composable
fun MapPicker(
    onLocationSelected: (LatLng) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        )
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted -> hasLocationPermission = isGranted }
    )

    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            launcher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    var currentLatLng by remember { mutableStateOf<LatLng?>(null) }
    
    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                if (location != null) {
                    currentLatLng = LatLng(location.latitude, location.longitude)
                }
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
        modifier = Modifier.fillMaxSize(),
        text = {
            Box(modifier = Modifier.fillMaxSize()) {
                val cameraPositionState = rememberCameraPositionState {
                    position = CameraPosition.fromLatLngZoom(currentLatLng ?: LatLng(20.5937, 78.9629), 15f)
                }
                
                LaunchedEffect(currentLatLng) {
                    currentLatLng?.let {
                        cameraPositionState.position = CameraPosition.fromLatLngZoom(it, 15f)
                    }
                }

                var markerPosition by remember { mutableStateOf<LatLng?>(null) }

                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = cameraPositionState,
                    onMapClick = { markerPosition = it },
                    properties = remember(hasLocationPermission) { MapProperties(isMyLocationEnabled = hasLocationPermission) },
                    uiSettings = remember(hasLocationPermission) { MapUiSettings(myLocationButtonEnabled = hasLocationPermission) }
                ) {
                    markerPosition?.let {
                        Marker(state = rememberMarkerState(position = it))
                    }
                }
                
                Card(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(24.dp)
                        .fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Select Location", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("Tap on the map to mark customer house", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { markerPosition?.let { onLocationSelected(it) } },
                            enabled = markerPosition != null,
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Confirm Selection")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                            Text("Cancel", color = Color.Red)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {}
    )
}
