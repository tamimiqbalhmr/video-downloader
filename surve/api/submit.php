<?php
header("Content-Type: application/json");

// Enable full error reporting
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Database config (MUST match docker-compose.yml)
$db = new mysqli(
    'db',           // Docker service name
    'survey_user',  // MUST match MYSQL_USER
    'userpass',     // MUST match MYSQL_PASSWORD
    'survey_db'     // MUST match MYSQL_DATABASE
);

// Verify connection
if ($db->connect_error) {
    die(json_encode([
        'error' => 'DB connection failed',
        'message' => $db->connect_error
    ]));
}

// Handle GET: return all submissions
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $db->query("SELECT name, email, feedback, submission_date FROM survey_responses ORDER BY submission_date DESC");
    $data = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $data[] = $row;
        }
    }
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

// Handle POST: add submission and return updated list
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    die(json_encode(['error' => 'Invalid JSON data']));
}

$required = ['name', 'email', 'feedback'];
foreach ($required as $field) {
    if (empty($input[$field])) {
        die(json_encode(['error' => "Missing $field"]));
    }
}

try {
    $stmt = $db->prepare("INSERT INTO survey_responses (name, email, feedback) VALUES (?, ?, ?)");
    $stmt->bind_param("sss", $input['name'], $input['email'], $input['feedback']);
    if (!$stmt->execute()) {
        throw new Exception($db->error);
    }
    // Fetch updated list
    $result = $db->query("SELECT name, email, feedback, submission_date FROM survey_responses ORDER BY submission_date DESC");
    $data = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $data[] = $row;
        }
    }
    echo json_encode([
        'success' => true,
        'insert_id' => $db->insert_id,
        'data' => $data
    ]);
} catch (Exception $e) {
    echo json_encode([
        'error' => 'Database error',
        'message' => $e->getMessage()
    ]);
}
?>