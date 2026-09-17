const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('HealthcareRecords', function () {
  let contract;
  let deployer, patient, doctor, hospital, stranger;

  beforeEach(async function () {
    [deployer, patient, doctor, hospital, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('HealthcareRecords');
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe('Deployment', function () {
    it('deploys with recordCount starting at 0', async function () {
      expect(await contract.recordCount()).to.equal(0n);
    });
  });

  describe('Registration', function () {
    it('registers a patient and emits PatientRegistered', async function () {
      await expect(contract.connect(patient).registerPatient())
        .to.emit(contract, 'PatientRegistered')
        .withArgs(patient.address);
      expect(await contract.getRole(patient.address)).to.equal(1n); // Role.Patient
      expect(await contract.isRegistered(patient.address)).to.equal(true);
    });

    it('registers a doctor and emits DoctorRegistered', async function () {
      await expect(contract.connect(doctor).registerDoctor())
        .to.emit(contract, 'DoctorRegistered')
        .withArgs(doctor.address);
      expect(await contract.getRole(doctor.address)).to.equal(2n); // Role.Doctor
    });

    it('registers a hospital and emits HospitalRegistered', async function () {
      await expect(contract.connect(hospital).registerHospital())
        .to.emit(contract, 'HospitalRegistered')
        .withArgs(hospital.address);
      expect(await contract.getRole(hospital.address)).to.equal(3n); // Role.Hospital
    });

    it('rejects duplicate registration for the same address', async function () {
      await contract.connect(patient).registerPatient();
      await expect(contract.connect(patient).registerPatient()).to.be.revertedWith(
        'Address is already registered'
      );
      await expect(contract.connect(patient).registerDoctor()).to.be.revertedWith(
        'Address is already registered'
      );
    });

    it('an unregistered address has Role.None and isRegistered() false', async function () {
      expect(await contract.getRole(stranger.address)).to.equal(0n); // Role.None
      expect(await contract.isRegistered(stranger.address)).to.equal(false);
    });
  });

  describe('Records', function () {
    beforeEach(async function () {
      await contract.connect(patient).registerPatient();
    });

    it('lets a registered patient add a record and emits RecordAdded', async function () {
      const tx = await contract.connect(patient).addRecord('mock-cid-abc123');
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === 'RecordAdded');

      expect(event).to.not.be.undefined;
      expect(event.args.recordId).to.equal(1n);
      expect(event.args.patient).to.equal(patient.address);
      expect(event.args.cid).to.equal('mock-cid-abc123');

      expect(await contract.recordCount()).to.equal(1n);
    });

    it('records the correct owning patient and CID, retrievable via getRecord', async function () {
      await contract.connect(patient).addRecord('mock-cid-xyz789');
      const [id, owner, cid] = await contract.getRecord(1);
      expect(id).to.equal(1n);
      expect(owner).to.equal(patient.address);
      expect(cid).to.equal('mock-cid-xyz789');
    });

    it('rejects record creation from an unregistered / non-patient address', async function () {
      await expect(contract.connect(stranger).addRecord('should-fail')).to.be.revertedWith(
        'Caller is not a registered patient'
      );

      await contract.connect(doctor).registerDoctor();
      await expect(contract.connect(doctor).addRecord('should-also-fail')).to.be.revertedWith(
        'Caller is not a registered patient'
      );
    });

    it('rejects an empty cid', async function () {
      await expect(contract.connect(patient).addRecord('')).to.be.revertedWith('cid is required');
    });

    it('tracks a patient\'s record ids via getPatientRecordIds', async function () {
      await contract.connect(patient).addRecord('cid-1');
      await contract.connect(patient).addRecord('cid-2');
      const ids = await contract.getPatientRecordIds(patient.address);
      expect(ids.map((n) => n.toString())).to.deep.equal(['1', '2']);
    });

    it('reverts getRecord for a nonexistent record id', async function () {
      await expect(contract.getRecord(999)).to.be.revertedWith('Record does not exist');
    });
  });

  describe('Access control', function () {
    beforeEach(async function () {
      await contract.connect(patient).registerPatient();
      await contract.connect(doctor).registerDoctor();
      await contract.connect(hospital).registerHospital();
    });

    it('access is denied by default', async function () {
      expect(await contract.hasAccess(patient.address, doctor.address)).to.equal(false);
    });

    it('a patient can grant access to a registered doctor, emitting AccessGranted', async function () {
      await expect(contract.connect(patient).grantAccess(doctor.address))
        .to.emit(contract, 'AccessGranted')
        .withArgs(patient.address, doctor.address);
      expect(await contract.hasAccess(patient.address, doctor.address)).to.equal(true);
    });

    it('a patient can grant access to a registered hospital', async function () {
      await contract.connect(patient).grantAccess(hospital.address);
      expect(await contract.hasAccess(patient.address, hospital.address)).to.equal(true);
    });

    it('rejects granting access to an unregistered address', async function () {
      await expect(contract.connect(patient).grantAccess(stranger.address)).to.be.revertedWith(
        'Provider must be a registered doctor or hospital'
      );
    });

    it('rejects granting access to another patient', async function () {
      const [, , , , , otherPatientSigner] = await ethers.getSigners();
      await contract.connect(otherPatientSigner).registerPatient();
      await expect(
        contract.connect(patient).grantAccess(otherPatientSigner.address)
      ).to.be.revertedWith('Provider must be a registered doctor or hospital');
    });

    it('only the patient themself can grant access to their records (not a third party)', async function () {
      await expect(contract.connect(stranger).grantAccess(doctor.address)).to.be.revertedWith(
        'Caller is not a registered patient'
      );
    });

    it('a patient can revoke previously granted access, emitting AccessRevoked', async function () {
      await contract.connect(patient).grantAccess(doctor.address);
      await expect(contract.connect(patient).revokeAccess(doctor.address))
        .to.emit(contract, 'AccessRevoked')
        .withArgs(patient.address, doctor.address);
      expect(await contract.hasAccess(patient.address, doctor.address)).to.equal(false);
    });

    it('revoking access that was never granted is a harmless no-op (stays false)', async function () {
      await contract.connect(patient).revokeAccess(doctor.address);
      expect(await contract.hasAccess(patient.address, doctor.address)).to.equal(false);
    });
  });
});
