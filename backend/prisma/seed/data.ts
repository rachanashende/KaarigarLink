/**
 * KaarigarLink seed dataset (M6).
 *
 * Deterministic: every record has a fixed "seed-" id, and every date is an
 * offset in days from the UTC day the seed runs, so the scenarios stay valid
 * whenever it is run. Accounts use the reserved ".test" domain.
 *
 * Each job carries `expected` matching outcomes (not stored in the DB). They are
 * the contract the matching engine (M7) is tested against, assuming these rules:
 *   - workshop VERIFIED (PENDING and REJECTED are excluded)
 *   - missing coordinates never exclude (distance is then omitted from the score)
 *   - capability for the job's process, with the job's material
 *   - an OPERATIONAL machine of a type suitable for the process
 *   - mandatory requirements met (machine type, tolerance, part size, certification)
 *   - capacity windows overlapping [now, deadline] hold >= quantity (pro-rated)
 *   - production time + capability lead time fits before the deadline
 * Distances below are approximate straight-line km from the job location.
 */
import type {
  MachineStatus,
  MachineType,
  ManufacturingProcess,
  QuantityUnit,
  RequirementType,
  Role,
  VerificationStatus,
  JobStatus,
} from '@prisma/client';

export const SEED_ID_PREFIX = 'seed-';
export const SEED_EMAIL_DOMAIN = 'kaarigarlink.test';

export interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
}

export interface SeedWorkshop {
  id: string;
  owner: SeedUser;
  businessName: string;
  description: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  certifications: string[];
  verificationStatus: VerificationStatus;
  rating: number;
  ratingCount: number;
  totalCompletedJobs: number;
  machines: {
    id: string;
    machineName: string;
    machineType: MachineType;
    quantity: number;
    operationalStatus: MachineStatus;
    specifications?: Record<string, unknown>;
  }[];
  capabilities: {
    id: string;
    manufacturingProcess: ManufacturingProcess;
    supportedMaterials: string[];
    leadTimeDays: number;
    specifications?: { minToleranceMm?: number; maxPartSizeMm?: number; [k: string]: unknown };
  }[];
  /** Days are offsets from the seed day; endDay is inclusive (end of that day). */
  capacities: { id: string; availableCapacity: number; capacityUnit: QuantityUnit; startDay: number; endDay: number }[];
}

export interface SeedJob {
  id: string;
  buyerId: string;
  title: string;
  description: string;
  material: string;
  manufacturingProcess: ManufacturingProcess;
  quantity: number;
  quantityUnit: QuantityUnit;
  /** Offset in days from the seed day; the deadline is the end of that day. */
  deadlineDay: number;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  technicalSpecifications: Record<string, unknown>;
  status: JobStatus;
  requirements: { id: string; requirementType: RequirementType; requirementValue: string; isMandatory: boolean }[];
  /** Intended matching outcome for M7 tests (not persisted). */
  expected: {
    scenario: string;
    eligible: string[];
    excluded: Record<string, string>;
  };
}

const email = (local: string) => `${local}@${SEED_EMAIL_DOMAIN}`;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const ADMINS: SeedUser[] = [
  { id: 'seed-user-admin', name: 'Kavita Deshpande', email: email('admin'), role: 'ADMIN' },
];

export const INSPECTORS: SeedUser[] = [
  { id: 'seed-user-inspector', name: 'Priya Nair', email: email('priya.inspector'), role: 'INSPECTOR' },
];

export const BUYERS: SeedUser[] = [
  { id: 'seed-user-buyer-asha', name: 'Asha Rao', email: email('asha.rao'), role: 'BUYER', phone: '+91 98200 11001' },
  { id: 'seed-user-buyer-vikram', name: 'Vikram Mehta', email: email('vikram.mehta'), role: 'BUYER', phone: '+91 98450 22002' },
  { id: 'seed-user-buyer-neha', name: 'Neha Kulkarni', email: email('neha.kulkarni'), role: 'BUYER', phone: '+91 98190 33003' },
  { id: 'seed-user-buyer-arjun', name: 'Arjun Iyer', email: email('arjun.iyer'), role: 'BUYER', phone: '+91 98400 44004' },
];

const owner = (slug: string, name: string): SeedUser => ({
  id: `seed-user-ws-${slug}`,
  name,
  email: email(slug),
  role: 'WORKSHOP',
});

// ---------------------------------------------------------------------------
// Workshops (12)
// ---------------------------------------------------------------------------

export const WORKSHOPS: SeedWorkshop[] = [
  {
    id: 'seed-ws-precision-works',
    owner: owner('precision-works', 'Ravi Patil'),
    businessName: 'Precision Works',
    description: '5-axis CNC milling and turning for aerospace and automotive parts.',
    address: 'Plot J-12, MIDC Bhosari',
    city: 'Pune',
    latitude: 18.6298,
    longitude: 73.8478,
    certifications: ['ISO_9001', 'AS9100'],
    verificationStatus: 'VERIFIED',
    rating: 4.8,
    ratingCount: 25,
    totalCompletedJobs: 40,
    machines: [
      { id: 'seed-ws-precision-works-m1', machineName: 'DMG Mori DMU 50 (5-axis)', machineType: 'CNC_MILL', quantity: 3, operationalStatus: 'OPERATIONAL', specifications: { axes: 5, bedSizeMm: [650, 520, 475] } },
      { id: 'seed-ws-precision-works-m2', machineName: 'Mazak QT-200', machineType: 'CNC_LATHE', quantity: 2, operationalStatus: 'OPERATIONAL', specifications: { maxTurningDiameterMm: 300 } },
    ],
    capabilities: [
      { id: 'seed-ws-precision-works-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'mild steel', 'stainless steel', 'brass'], leadTimeDays: 3, specifications: { minToleranceMm: 0.01, maxPartSizeMm: 600 } },
      { id: 'seed-ws-precision-works-c2', manufacturingProcess: 'LATHE_TURNING', supportedMaterials: ['aluminium', 'brass', 'mild steel'], leadTimeDays: 2, specifications: { minToleranceMm: 0.02, maxPartSizeMm: 300 } },
    ],
    capacities: [{ id: 'seed-ws-precision-works-k1', availableCapacity: 2000, capacityUnit: 'UNITS', startDay: 0, endDay: 45 }],
  },
  {
    id: 'seed-ws-chakan-cnc',
    owner: owner('chakan-cnc', 'Sanjay More'),
    businessName: 'Chakan CNC Hub',
    description: 'Mid-volume CNC milling for automotive suppliers. No certifications yet.',
    address: 'Gat No. 210, Chakan Industrial Area',
    city: 'Pune',
    latitude: 18.7606,
    longitude: 73.8636,
    certifications: [],
    verificationStatus: 'VERIFIED',
    rating: 4.2,
    ratingCount: 14,
    totalCompletedJobs: 22,
    machines: [
      { id: 'seed-ws-chakan-cnc-m1', machineName: 'Haas VF-2', machineType: 'CNC_MILL', quantity: 2, operationalStatus: 'OPERATIONAL', specifications: { axes: 3 } },
    ],
    capabilities: [
      { id: 'seed-ws-chakan-cnc-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'mild steel'], leadTimeDays: 5, specifications: { minToleranceMm: 0.05, maxPartSizeMm: 400 } },
    ],
    capacities: [{ id: 'seed-ws-chakan-cnc-k1', availableCapacity: 1200, capacityUnit: 'UNITS', startDay: 0, endDay: 40 }],
  },
  {
    id: 'seed-ws-mumbai-metalcraft',
    owner: owner('mumbai-metalcraft', 'Farhan Shaikh'),
    businessName: 'Mumbai Metalcraft',
    description: 'CNC machining, laser cutting and sheet-metal fabrication under one roof.',
    address: 'Unit 4, Marol Industrial Estate, Andheri East',
    city: 'Mumbai',
    latitude: 19.1136,
    longitude: 72.8697,
    certifications: ['ISO_9001'],
    verificationStatus: 'VERIFIED',
    rating: 4.6,
    ratingCount: 31,
    totalCompletedJobs: 55,
    machines: [
      { id: 'seed-ws-mumbai-metalcraft-m1', machineName: 'Haas VF-4', machineType: 'CNC_MILL', quantity: 2, operationalStatus: 'OPERATIONAL' },
      { id: 'seed-ws-mumbai-metalcraft-m2', machineName: 'Trumpf TruLaser 3030', machineType: 'LASER_CUTTER', quantity: 1, operationalStatus: 'OPERATIONAL', specifications: { powerKw: 4, sheetSizeMm: [3000, 1500] } },
      { id: 'seed-ws-mumbai-metalcraft-m3', machineName: 'Amada HG 1303', machineType: 'PRESS_BRAKE', quantity: 1, operationalStatus: 'OPERATIONAL' },
    ],
    capabilities: [
      { id: 'seed-ws-mumbai-metalcraft-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'stainless steel'], leadTimeDays: 4, specifications: { minToleranceMm: 0.02, maxPartSizeMm: 800 } },
      { id: 'seed-ws-mumbai-metalcraft-c2', manufacturingProcess: 'LASER_CUTTING', supportedMaterials: ['mild steel', 'stainless steel', 'aluminium'], leadTimeDays: 2, specifications: { maxPartSizeMm: 2500 } },
      { id: 'seed-ws-mumbai-metalcraft-c3', manufacturingProcess: 'SHEET_METAL_FABRICATION', supportedMaterials: ['mild steel', 'stainless steel', 'aluminium'], leadTimeDays: 5, specifications: { maxPartSizeMm: 2000 } },
    ],
    capacities: [{ id: 'seed-ws-mumbai-metalcraft-k1', availableCapacity: 3000, capacityUnit: 'UNITS', startDay: 0, endDay: 60 }],
  },
  {
    id: 'seed-ws-nashik-small-batch',
    owner: owner('nashik-small-batch', 'Meera Joshi'),
    businessName: 'Nashik Small Batch',
    description: 'New single-machine shop for prototypes and short runs. Awaiting verification.',
    address: 'Shed 18, Satpur MIDC',
    city: 'Nashik',
    latitude: 19.9975,
    longitude: 73.7898,
    certifications: ['ISO_9001'],
    verificationStatus: 'PENDING',
    rating: 0,
    ratingCount: 0,
    totalCompletedJobs: 0,
    machines: [
      { id: 'seed-ws-nashik-small-batch-m1', machineName: 'Haas Mini Mill', machineType: 'CNC_MILL', quantity: 1, operationalStatus: 'OPERATIONAL' },
    ],
    capabilities: [
      { id: 'seed-ws-nashik-small-batch-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], leadTimeDays: 2, specifications: { minToleranceMm: 0.05, maxPartSizeMm: 250 } },
    ],
    capacities: [{ id: 'seed-ws-nashik-small-batch-k1', availableCapacity: 300, capacityUnit: 'UNITS', startDay: 0, endDay: 30 }],
  },
  {
    id: 'seed-ws-ahmedabad-polymers',
    owner: owner('ahmedabad-polymers', 'Hetal Shah'),
    businessName: 'Ahmedabad Polymers',
    description: 'High-volume injection moulding. Tooling adds about 10 days to every order.',
    address: 'Phase IV, GIDC Vatva',
    city: 'Ahmedabad',
    latitude: 22.9676,
    longitude: 72.6331,
    certifications: ['ISO_9001', 'ISO_14001'],
    verificationStatus: 'VERIFIED',
    rating: 4.4,
    ratingCount: 19,
    totalCompletedJobs: 37,
    machines: [
      { id: 'seed-ws-ahmedabad-polymers-m1', machineName: 'Engel victory 200', machineType: 'INJECTION_MOLDER', quantity: 4, operationalStatus: 'OPERATIONAL', specifications: { clampForceTonnes: 200 } },
    ],
    capabilities: [
      { id: 'seed-ws-ahmedabad-polymers-c1', manufacturingProcess: 'INJECTION_MOLDING', supportedMaterials: ['abs plastic', 'polypropylene', 'nylon'], leadTimeDays: 10, specifications: { maxPartSizeMm: 400 } },
    ],
    capacities: [{ id: 'seed-ws-ahmedabad-polymers-k1', availableCapacity: 50000, capacityUnit: 'UNITS', startDay: 0, endDay: 90 }],
  },
  {
    id: 'seed-ws-bengaluru-additive',
    owner: owner('bengaluru-additive', 'Karthik Reddy'),
    businessName: 'Bengaluru Additive Labs',
    description: 'Industrial metal and polymer 3D printing, aerospace certified.',
    address: '2nd Stage, Peenya Industrial Area',
    city: 'Bengaluru',
    latitude: 13.0285,
    longitude: 77.5197,
    certifications: ['AS9100'],
    verificationStatus: 'VERIFIED',
    rating: 4.9,
    ratingCount: 12,
    totalCompletedJobs: 18,
    machines: [
      { id: 'seed-ws-bengaluru-additive-m1', machineName: 'EOS M 290', machineType: 'THREE_D_PRINTER', quantity: 2, operationalStatus: 'OPERATIONAL', specifications: { technology: 'DMLS' } },
      { id: 'seed-ws-bengaluru-additive-m2', machineName: 'HP Multi Jet Fusion 5200', machineType: 'THREE_D_PRINTER', quantity: 4, operationalStatus: 'OPERATIONAL', specifications: { technology: 'MJF' } },
    ],
    capabilities: [
      { id: 'seed-ws-bengaluru-additive-c1', manufacturingProcess: 'THREE_D_PRINTING', supportedMaterials: ['nylon', 'abs plastic', 'titanium', 'aluminium'], leadTimeDays: 1, specifications: { minToleranceMm: 0.1, maxPartSizeMm: 300 } },
    ],
    capacities: [{ id: 'seed-ws-bengaluru-additive-k1', availableCapacity: 600, capacityUnit: 'UNITS', startDay: 0, endDay: 20 }],
  },
  {
    id: 'seed-ws-hadapsar-fabricators',
    owner: owner('hadapsar-fabricators', 'Rohit Pawar'),
    businessName: 'Hadapsar Fabricators',
    description: 'CNC shop whose verification was rejected after a failed audit.',
    address: 'Hadapsar Industrial Estate',
    city: 'Pune',
    latitude: 18.5089,
    longitude: 73.926,
    certifications: ['ISO_9001'],
    verificationStatus: 'REJECTED',
    rating: 3.0,
    ratingCount: 6,
    totalCompletedJobs: 9,
    machines: [
      { id: 'seed-ws-hadapsar-fabricators-m1', machineName: 'BFW Akshara VF 30', machineType: 'CNC_MILL', quantity: 2, operationalStatus: 'OPERATIONAL' },
    ],
    capabilities: [
      { id: 'seed-ws-hadapsar-fabricators-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'mild steel'], leadTimeDays: 3, specifications: { minToleranceMm: 0.02, maxPartSizeMm: 500 } },
    ],
    capacities: [{ id: 'seed-ws-hadapsar-fabricators-k1', availableCapacity: 5000, capacityUnit: 'UNITS', startDay: 0, endDay: 60 }],
  },
  {
    id: 'seed-ws-coimbatore-castings',
    owner: owner('coimbatore-castings', 'Lakshmi Sundaram'),
    businessName: 'Coimbatore Castings',
    description: 'Grey-iron and aluminium sand casting with in-house CNC turning.',
    address: 'SIDCO Industrial Estate, Kurichi',
    city: 'Coimbatore',
    latitude: 11.0168,
    longitude: 76.9558,
    certifications: ['ISO_9001'],
    verificationStatus: 'VERIFIED',
    rating: 4.1,
    ratingCount: 27,
    totalCompletedJobs: 60,
    machines: [
      { id: 'seed-ws-coimbatore-castings-m1', machineName: 'Induction furnace 500 kg', machineType: 'CASTING_FURNACE', quantity: 2, operationalStatus: 'OPERATIONAL' },
      { id: 'seed-ws-coimbatore-castings-m2', machineName: 'Ace Jobber XL', machineType: 'CNC_LATHE', quantity: 1, operationalStatus: 'OPERATIONAL' },
    ],
    capabilities: [
      { id: 'seed-ws-coimbatore-castings-c1', manufacturingProcess: 'CASTING', supportedMaterials: ['cast iron', 'aluminium'], leadTimeDays: 14, specifications: { maxPartSizeMm: 1200 } },
      { id: 'seed-ws-coimbatore-castings-c2', manufacturingProcess: 'LATHE_TURNING', supportedMaterials: ['cast iron', 'mild steel'], leadTimeDays: 3, specifications: { minToleranceMm: 0.05, maxPartSizeMm: 400 } },
    ],
    capacities: [{ id: 'seed-ws-coimbatore-castings-k1', availableCapacity: 10000, capacityUnit: 'UNITS', startDay: 0, endDay: 90 }],
  },
  {
    id: 'seed-ws-kothrud-precision',
    owner: owner('kothrud-precision', 'Anil Gokhale'),
    businessName: 'Kothrud Precision',
    description: 'Highly rated CNC shop. All machines currently down for maintenance.',
    address: 'Karve Road, Kothrud',
    city: 'Pune',
    latitude: 18.5074,
    longitude: 73.8077,
    certifications: ['ISO_9001'],
    verificationStatus: 'VERIFIED',
    rating: 4.7,
    ratingCount: 33,
    totalCompletedJobs: 48,
    machines: [
      { id: 'seed-ws-kothrud-precision-m1', machineName: 'Haas VF-3', machineType: 'CNC_MILL', quantity: 2, operationalStatus: 'MAINTENANCE' },
      { id: 'seed-ws-kothrud-precision-m2', machineName: 'Jyoti DX 200', machineType: 'CNC_LATHE', quantity: 1, operationalStatus: 'OFFLINE' },
    ],
    capabilities: [
      { id: 'seed-ws-kothrud-precision-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'mild steel'], leadTimeDays: 3, specifications: { minToleranceMm: 0.01, maxPartSizeMm: 500 } },
    ],
    capacities: [{ id: 'seed-ws-kothrud-precision-k1', availableCapacity: 3000, capacityUnit: 'UNITS', startDay: 0, endDay: 60 }],
  },
  {
    id: 'seed-ws-pimpri-steelworks',
    owner: owner('pimpri-steelworks', 'Gurpreet Singh'),
    businessName: 'Pimpri Steelworks',
    description: 'Welding and mild-steel fabrication. Location not yet set on the profile.',
    address: 'Pimpri Industrial Area',
    city: 'Pune',
    latitude: null,
    longitude: null,
    certifications: [],
    verificationStatus: 'VERIFIED',
    rating: 3.8,
    ratingCount: 10,
    totalCompletedJobs: 15,
    machines: [
      { id: 'seed-ws-pimpri-steelworks-m1', machineName: 'Lincoln Electric MIG station', machineType: 'WELDING_STATION', quantity: 5, operationalStatus: 'OPERATIONAL' },
      { id: 'seed-ws-pimpri-steelworks-m2', machineName: 'Hindustan Hydraulics press brake', machineType: 'PRESS_BRAKE', quantity: 1, operationalStatus: 'OPERATIONAL' },
    ],
    capabilities: [
      { id: 'seed-ws-pimpri-steelworks-c1', manufacturingProcess: 'WELDING', supportedMaterials: ['mild steel', 'stainless steel'], leadTimeDays: 3 },
      { id: 'seed-ws-pimpri-steelworks-c2', manufacturingProcess: 'SHEET_METAL_FABRICATION', supportedMaterials: ['mild steel'], leadTimeDays: 4, specifications: { maxPartSizeMm: 1500 } },
    ],
    capacities: [{ id: 'seed-ws-pimpri-steelworks-k1', availableCapacity: 800, capacityUnit: 'UNITS', startDay: 0, endDay: 30 }],
  },
  {
    id: 'seed-ws-delhi-precision',
    owner: owner('delhi-precision', 'Amit Malhotra'),
    businessName: 'Delhi Precision Engineering',
    description: 'Fully certified CNC shop, booked solid until its next free window.',
    address: 'Okhla Industrial Area Phase II',
    city: 'New Delhi',
    latitude: 28.5355,
    longitude: 77.271,
    certifications: ['ISO_9001', 'AS9100'],
    verificationStatus: 'VERIFIED',
    rating: 4.5,
    ratingCount: 21,
    totalCompletedJobs: 35,
    machines: [
      { id: 'seed-ws-delhi-precision-m1', machineName: 'Makino PS95', machineType: 'CNC_MILL', quantity: 3, operationalStatus: 'OPERATIONAL' },
    ],
    capabilities: [
      { id: 'seed-ws-delhi-precision-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'stainless steel', 'mild steel'], leadTimeDays: 3, specifications: { minToleranceMm: 0.01, maxPartSizeMm: 700 } },
    ],
    // Only free AFTER day 50: no overlap with any near-term deadline.
    capacities: [{ id: 'seed-ws-delhi-precision-k1', availableCapacity: 5000, capacityUnit: 'UNITS', startDay: 50, endDay: 80 }],
  },
  {
    id: 'seed-ws-talegaon-tooling',
    owner: owner('talegaon-tooling', 'Suresh Kadam'),
    businessName: 'Talegaon Tooling',
    description: 'Reliable CNC jobbing shop close to Pune.',
    address: 'Talegaon MIDC Phase 1',
    city: 'Pune',
    latitude: 18.735,
    longitude: 73.6756,
    certifications: ['ISO_9001'],
    verificationStatus: 'VERIFIED',
    rating: 3.9,
    ratingCount: 16,
    totalCompletedJobs: 24,
    machines: [
      { id: 'seed-ws-talegaon-tooling-m1', machineName: 'Jyoti PX 10', machineType: 'CNC_MILL', quantity: 2, operationalStatus: 'OPERATIONAL' },
    ],
    capabilities: [
      { id: 'seed-ws-talegaon-tooling-c1', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'mild steel'], leadTimeDays: 4, specifications: { minToleranceMm: 0.03, maxPartSizeMm: 500 } },
    ],
    capacities: [{ id: 'seed-ws-talegaon-tooling-k1', availableCapacity: 1500, capacityUnit: 'UNITS', startDay: 0, endDay: 35 }],
  },
];

// ---------------------------------------------------------------------------
// Jobs (11)
// ---------------------------------------------------------------------------

const req = (jobId: string, n: number, requirementType: RequirementType, requirementValue: string, isMandatory = true) => ({
  id: `${jobId}-r${n}`,
  requirementType,
  requirementValue,
  isMandatory,
});

const HINJEWADI = { address: 'Hinjewadi Phase 1, Pune', latitude: 18.5912, longitude: 73.7389 };

export const JOBS: SeedJob[] = [
  {
    id: 'seed-job-alu-brackets',
    buyerId: 'seed-user-buyer-asha',
    title: '500 CNC-machined aluminium brackets',
    description: 'Mounting brackets for an EV battery tray, per drawing BRK-101 rev C.',
    material: 'aluminium',
    manufacturingProcess: 'CNC_MACHINING',
    quantity: 500,
    quantityUnit: 'UNITS',
    deadlineDay: 30,
    ...HINJEWADI,
    technicalSpecifications: { drawing: 'BRK-101 rev C', finish: 'clear anodised', alloy: '6061-T6' },
    status: 'OPEN',
    requirements: [
      req('seed-job-alu-brackets', 1, 'MACHINE_TYPE', 'CNC_MILL'),
      req('seed-job-alu-brackets', 2, 'TOLERANCE_MM', '0.05'),
      req('seed-job-alu-brackets', 3, 'CERTIFICATION', 'ISO_9001'),
    ],
    expected: {
      scenario: 'Multiple eligible workshops at different distances and ratings; every exclusion reason is represented',
      eligible: ['seed-ws-precision-works', 'seed-ws-talegaon-tooling', 'seed-ws-mumbai-metalcraft'],
      excluded: {
        'seed-ws-chakan-cnc': 'certification: lacks ISO_9001',
        'seed-ws-nashik-small-batch': 'capacity: about 295 units free before the deadline, needs 500 (also unverified)',
        'seed-ws-hadapsar-fabricators': 'verification: REJECTED',
        'seed-ws-kothrud-precision': 'machine: no OPERATIONAL CNC machine (maintenance/offline)',
        'seed-ws-delhi-precision': 'capacity: only window starts day 50, after the deadline',
        'seed-ws-bengaluru-additive': 'capability: no CNC_MACHINING',
      },
    },
  },
  {
    id: 'seed-job-titanium-drone',
    buyerId: 'seed-user-buyer-vikram',
    title: 'Titanium 3D-printed drone arm brackets',
    description: 'Lightweight topology-optimised brackets for a surveillance drone.',
    material: 'titanium',
    manufacturingProcess: 'THREE_D_PRINTING',
    quantity: 200,
    quantityUnit: 'UNITS',
    deadlineDay: 15,
    address: 'Whitefield, Bengaluru',
    latitude: 12.9698,
    longitude: 77.75,
    technicalSpecifications: { alloy: 'Ti-6Al-4V', postProcessing: 'stress relief + bead blast' },
    status: 'OPEN',
    requirements: [
      req('seed-job-titanium-drone', 1, 'CERTIFICATION', 'AS9100'),
      req('seed-job-titanium-drone', 2, 'PART_SIZE_MM', '250'),
    ],
    expected: {
      scenario: 'Exactly one eligible workshop',
      eligible: ['seed-ws-bengaluru-additive'],
      excluded: { 'seed-ws-ahmedabad-polymers': 'capability: no THREE_D_PRINTING' },
    },
  },
  {
    id: 'seed-job-stainless-shafts',
    buyerId: 'seed-user-buyer-asha',
    title: 'High-precision stainless steel shafts',
    description: 'Pump shafts with tight concentricity tolerances.',
    material: 'Stainless Steel',
    manufacturingProcess: 'CNC_MACHINING',
    quantity: 300,
    quantityUnit: 'UNITS',
    deadlineDay: 25,
    ...HINJEWADI,
    technicalSpecifications: { grade: 'SS316', surfaceFinishRa: 0.8 },
    status: 'OPEN',
    requirements: [
      req('seed-job-stainless-shafts', 1, 'TOLERANCE_MM', '0.01'),
      req('seed-job-stainless-shafts', 2, 'CERTIFICATION', 'AS9100'),
    ],
    expected: {
      scenario: 'Single match; strict tolerance and certification filter out capable shops',
      eligible: ['seed-ws-precision-works'],
      excluded: {
        'seed-ws-mumbai-metalcraft': 'tolerance 0.02 mm is looser than 0.01 mm, and no AS9100',
        'seed-ws-delhi-precision': 'capacity: no window before the deadline (meets every other requirement)',
        'seed-ws-chakan-cnc': 'material: no stainless steel',
      },
    },
  },
  {
    id: 'seed-job-pp-housings-urgent',
    buyerId: 'seed-user-buyer-neha',
    title: 'Urgent polypropylene sensor housings',
    description: 'Snap-fit housings needed for a trade-show launch.',
    material: 'polypropylene',
    manufacturingProcess: 'INJECTION_MOLDING',
    quantity: 2000,
    quantityUnit: 'UNITS',
    deadlineDay: 8,
    address: 'Lower Parel, Mumbai',
    latitude: 18.9986,
    longitude: 72.8302,
    technicalSpecifications: { colour: 'RAL 9003', wallThicknessMm: 2 },
    status: 'OPEN',
    requirements: [],
    expected: {
      scenario: 'No eligible matches: deadline too tight',
      eligible: [],
      excluded: { 'seed-ws-ahmedabad-polymers': 'deadline: about 4 days of production + 10 days tooling is more than 8 days' },
    },
  },
  {
    id: 'seed-job-laser-panels',
    buyerId: 'seed-user-buyer-neha',
    title: 'Laser-cut stainless steel control panels',
    description: 'Front panels for industrial control cabinets.',
    material: 'stainless steel',
    manufacturingProcess: 'LASER_CUTTING',
    quantity: 600,
    quantityUnit: 'UNITS',
    deadlineDay: 20,
    address: 'Bhandup West, Mumbai',
    latitude: 19.1438,
    longitude: 72.9366,
    technicalSpecifications: { sheetThicknessMm: 1.5, finish: 'brushed #4' },
    status: 'OPEN',
    requirements: [req('seed-job-laser-panels', 1, 'MACHINE_TYPE', 'LASER_CUTTER')],
    expected: {
      scenario: 'Single nearby match',
      eligible: ['seed-ws-mumbai-metalcraft'],
      excluded: { 'seed-ws-pimpri-steelworks': 'capability: no LASER_CUTTING / no laser cutter' },
    },
  },
  {
    id: 'seed-job-welded-frames',
    buyerId: 'seed-user-buyer-arjun',
    title: 'Mild steel welded machine frames',
    description: 'Base frames for packaging machines, MIG welded and primed.',
    material: 'Mild Steel',
    manufacturingProcess: 'WELDING',
    quantity: 200,
    quantityUnit: 'UNITS',
    deadlineDay: 25,
    address: 'Shivajinagar, Pune',
    latitude: 18.5308,
    longitude: 73.8475,
    technicalSpecifications: { weldStandard: 'IS 816', finish: 'red oxide primer' },
    status: 'OPEN',
    requirements: [],
    expected: {
      scenario: 'Eligible workshop with missing location (distance unknown)',
      eligible: ['seed-ws-pimpri-steelworks'],
      excluded: {},
    },
  },
  {
    id: 'seed-job-cast-iron-pumps',
    buyerId: 'seed-user-buyer-arjun',
    title: 'Grey cast iron pump housings',
    description: 'Volute casings for agricultural pumps, machined faces.',
    material: 'cast iron',
    manufacturingProcess: 'CASTING',
    quantity: 3000,
    quantityUnit: 'UNITS',
    deadlineDay: 50,
    address: 'Ambattur Industrial Estate, Chennai',
    latitude: 13.1143,
    longitude: 80.1548,
    technicalSpecifications: { grade: 'FG 260', pressureTestBar: 10 },
    status: 'OPEN',
    requirements: [req('seed-job-cast-iron-pumps', 1, 'CERTIFICATION', 'ISO_9001')],
    expected: {
      scenario: 'Single distant match (long lead time still fits)',
      eligible: ['seed-ws-coimbatore-castings'],
      excluded: {},
    },
  },
  {
    id: 'seed-job-turned-fittings',
    buyerId: 'seed-user-buyer-asha',
    title: 'Mild steel turned hydraulic fittings',
    description: 'Threaded adaptors for hydraulic hose assemblies.',
    material: 'mild steel',
    manufacturingProcess: 'LATHE_TURNING',
    quantity: 600,
    quantityUnit: 'UNITS',
    deadlineDay: 20,
    ...HINJEWADI,
    technicalSpecifications: { thread: 'BSPP 1/2"', plating: 'zinc yellow' },
    status: 'OPEN',
    requirements: [req('seed-job-turned-fittings', 1, 'MACHINE_TYPE', 'CNC_LATHE')],
    expected: {
      scenario: 'Two eligible workshops with a very large distance gap (Pune vs Coimbatore)',
      eligible: ['seed-ws-precision-works', 'seed-ws-coimbatore-castings'],
      excluded: {},
    },
  },
  {
    id: 'seed-job-enclosures-draft',
    buyerId: 'seed-user-buyer-vikram',
    title: 'Aluminium sheet-metal enclosures (draft)',
    description: 'Still finalising the drawings; not ready for matching.',
    material: 'aluminium',
    manufacturingProcess: 'SHEET_METAL_FABRICATION',
    quantity: 150,
    quantityUnit: 'UNITS',
    deadlineDay: 30,
    address: 'Baner, Pune',
    latitude: 18.559,
    longitude: 73.7868,
    technicalSpecifications: { gaugeMm: 1.2, finish: 'powder coat black' },
    status: 'DRAFT',
    requirements: [],
    expected: {
      scenario: 'DRAFT job: matching should refuse to run until the buyer opens it',
      eligible: [],
      excluded: { 'seed-ws-pimpri-steelworks': 'material: mild steel only (if the job were OPEN)' },
    },
  },
  {
    id: 'seed-job-nylon-gears-no-location',
    buyerId: 'seed-user-buyer-neha',
    title: 'Nylon 3D-printed prototype gears',
    description: 'Functional prototypes; buyer has not shared a delivery location.',
    material: 'nylon',
    manufacturingProcess: 'THREE_D_PRINTING',
    quantity: 100,
    quantityUnit: 'UNITS',
    deadlineDay: 12,
    address: null,
    latitude: null,
    longitude: null,
    technicalSpecifications: { module: 1.5, teeth: 32 },
    status: 'OPEN',
    requirements: [],
    expected: {
      scenario: 'Job without a location: distance cannot be computed',
      eligible: ['seed-ws-bengaluru-additive'],
      excluded: {},
    },
  },
  {
    id: 'seed-job-nashik-prototypes',
    buyerId: 'seed-user-buyer-arjun',
    title: 'Aluminium prototype blocks for Nashik plant',
    description: 'Short run of fixture blocks; no certification needed.',
    material: 'aluminium',
    manufacturingProcess: 'CNC_MACHINING',
    quantity: 100,
    quantityUnit: 'UNITS',
    deadlineDay: 20,
    address: 'Ambad MIDC, Nashik',
    latitude: 19.9615,
    longitude: 73.7444,
    technicalSpecifications: { alloy: '6082', tolerance: 'general ISO 2768-m' },
    status: 'OPEN',
    requirements: [],
    expected: {
      scenario: 'Nearest workshop is unverified (PENDING) and excluded; four verified shops ranked',
      eligible: [
        'seed-ws-precision-works',
        'seed-ws-chakan-cnc',
        'seed-ws-mumbai-metalcraft',
        'seed-ws-talegaon-tooling',
      ],
      excluded: {
        'seed-ws-nashik-small-batch': 'verification: PENDING - meets every other requirement but is not verified',
        'seed-ws-hadapsar-fabricators': 'verification: REJECTED',
        'seed-ws-kothrud-precision': 'machine: no OPERATIONAL CNC machine',
        'seed-ws-delhi-precision': 'capacity: window starts after the deadline',
      },
    },
  },
];

export const ALL_USERS: SeedUser[] = [...ADMINS, ...INSPECTORS, ...BUYERS, ...WORKSHOPS.map((w) => w.owner)];
