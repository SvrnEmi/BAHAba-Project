/// The 25 official barangays of Odiongan, Romblon (PSA), with approximate
/// centre points matching the Supabase barangays table.
///
/// The app reads names and coordinates from the barangays table. Guests cannot
/// read that table (RLS allows authenticated reads only), so this list is the
/// fallback for Quick Report, Register and offline use, and the first-launch
/// seed of the local map cache. Only [BarangayRepository] and the seed use it;
/// screens call the repository. Names must match barangays.name exactly.
class OfficialBarangay {
  final String name;
  final double lat;
  final double lng;

  const OfficialBarangay(this.name, this.lat, this.lng);
}

const List<OfficialBarangay> officialBarangays = [
  OfficialBarangay('Amatong', 12.3929, 122.0103),
  OfficialBarangay('Anahao', 12.3697, 121.9626),
  OfficialBarangay('Bangon', 12.3835, 121.9801),
  OfficialBarangay('Batiano', 12.4198, 121.9892),
  OfficialBarangay('Budiong', 12.4027, 121.9740),
  OfficialBarangay('Canduyong', 12.3977, 121.9544),
  OfficialBarangay('Dapawan', 12.4027, 121.9900),
  OfficialBarangay('Gabawan', 12.4262, 122.0001),
  OfficialBarangay('Libertad', 12.4539, 122.0060),
  OfficialBarangay('Ligaya', 12.4049, 121.9811),
  OfficialBarangay('Liwanag', 12.3957, 121.9822),
  OfficialBarangay('Liwayway', 12.4001, 121.9818),
  OfficialBarangay('Malilico', 12.3472, 121.9736),
  OfficialBarangay('Mayha', 12.3740, 121.9931),
  OfficialBarangay('Panique', 12.4784, 122.0118),
  OfficialBarangay('Pato-o', 12.4097, 122.0242),
  OfficialBarangay('Poctoy', 12.4084, 121.9929),
  OfficialBarangay('Progreso Este', 12.3539, 122.0143),
  OfficialBarangay('Progreso Weste', 12.3411, 121.9984),
  OfficialBarangay('Rizal', 12.3656, 122.0095),
  OfficialBarangay('Tabing Dagat', 12.4030, 121.9805),
  OfficialBarangay('Tabobo-an', 12.3738, 121.9871),
  OfficialBarangay('Tuburan', 12.4528, 122.0226),
  OfficialBarangay('Tulay', 12.3899, 121.9844),
  OfficialBarangay('Tumingad', 12.4410, 122.0065),
];

/// Official names, alphabetical.
final List<String> officialBarangayNames =
    List.unmodifiable(officialBarangays.map((b) => b.name));
