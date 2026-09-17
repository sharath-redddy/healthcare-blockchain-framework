// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HealthcareRecords
/// @notice Patient-centric on-chain metadata and access control.
/// @dev Stores ONLY: wallet identities, roles, record references (CID),
/// and access permissions. Never stores medical file contents, AES keys,
/// or private keys. No OpenZeppelin dependency — the access-control
/// surface here (three flat roles, no ownership transfer, no upgrades)
/// is simple enough that hand-rolled mappings + require() checks are
/// clearer and avoid an unnecessary dependency.
contract HealthcareRecords {
    enum Role {
        None,
        Patient,
        Doctor,
        Hospital
    }

    struct Record {
        uint256 id;
        address patient;
        string cid;
        uint256 timestamp;
        bool exists;
    }

    mapping(address => Role) public roles;
    mapping(uint256 => Record) public records;
    uint256 public recordCount;
    mapping(address => uint256[]) private patientRecordIds;

    // access[patient][provider] => granted?
    mapping(address => mapping(address => bool)) public access;

    event PatientRegistered(address indexed patient);
    event DoctorRegistered(address indexed doctor);
    event HospitalRegistered(address indexed hospital);
    event RecordAdded(uint256 indexed recordId, address indexed patient, string cid, uint256 timestamp);
    event AccessGranted(address indexed patient, address indexed provider);
    event AccessRevoked(address indexed patient, address indexed provider);

    modifier onlyPatient() {
        require(roles[msg.sender] == Role.Patient, "Caller is not a registered patient");
        _;
    }

    modifier onlyUnregistered() {
        require(roles[msg.sender] == Role.None, "Address is already registered");
        _;
    }

    // ---------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------

    function registerPatient() external onlyUnregistered {
        roles[msg.sender] = Role.Patient;
        emit PatientRegistered(msg.sender);
    }

    function registerDoctor() external onlyUnregistered {
        roles[msg.sender] = Role.Doctor;
        emit DoctorRegistered(msg.sender);
    }

    function registerHospital() external onlyUnregistered {
        roles[msg.sender] = Role.Hospital;
        emit HospitalRegistered(msg.sender);
    }

    // ---------------------------------------------------------------
    // Records — patient-owned, CID reference only (no keys, no files)
    // ---------------------------------------------------------------

    function addRecord(string calldata cid) external onlyPatient returns (uint256 recordId) {
        require(bytes(cid).length > 0, "cid is required");

        recordCount += 1;
        recordId = recordCount;

        records[recordId] = Record({
            id: recordId,
            patient: msg.sender,
            cid: cid,
            timestamp: block.timestamp,
            exists: true
        });
        patientRecordIds[msg.sender].push(recordId);

        emit RecordAdded(recordId, msg.sender, cid, block.timestamp);
    }

    function getRecord(uint256 recordId)
        external
        view
        returns (uint256 id, address patient, string memory cid, uint256 timestamp)
    {
        Record memory r = records[recordId];
        require(r.exists, "Record does not exist");
        return (r.id, r.patient, r.cid, r.timestamp);
    }

    function getPatientRecordIds(address patient) external view returns (uint256[] memory) {
        return patientRecordIds[patient];
    }

    // ---------------------------------------------------------------
    // Access control — patient grants/revokes; only the patient
    // themself can manage access to their own records. No admin
    // override exists here by design (patient-centric ownership).
    // ---------------------------------------------------------------

    function grantAccess(address provider) external onlyPatient {
        require(
            roles[provider] == Role.Doctor || roles[provider] == Role.Hospital,
            "Provider must be a registered doctor or hospital"
        );
        access[msg.sender][provider] = true;
        emit AccessGranted(msg.sender, provider);
    }

    function revokeAccess(address provider) external onlyPatient {
        access[msg.sender][provider] = false;
        emit AccessRevoked(msg.sender, provider);
    }

    function hasAccess(address patient, address provider) external view returns (bool) {
        return access[patient][provider];
    }

    // ---------------------------------------------------------------
    // Read helpers
    // ---------------------------------------------------------------

    function getRole(address account) external view returns (Role) {
        return roles[account];
    }

    function isRegistered(address account) external view returns (bool) {
        return roles[account] != Role.None;
    }
}
