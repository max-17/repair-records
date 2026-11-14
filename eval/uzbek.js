// Fictional repair-shop messages. No production records are read or written.
const row=(text,expected,state={})=>({text,expected,state});
export const cases=[
 row('Bekzod akadan iPhone 14 Pro oldim, ekran almashtirish 1 million so‘m, ertaga tayyor',{action:'create',device:'iPhone 14 Pro',price_uzs:1000000}),
 row('Aziz aka Samsung S23 batareya almashtirishga tashlab ketdi, narxi 200 ming',{action:'create',device:'Samsung S23',price_uzs:200000}),
 row('Menga atchot ber',{action:'clarify'}),
 row('Bekzod aka iPhone 14 Pro tayyor',{action:'update',status:'ready'}),
 row('Bugun nechta buyurtma oldim?',{action:'analytics',start_date:'TODAY',end_date:'TODAY'}),
 row('Bekzod 100 ming avans berdi',{action:'clarify'}),
 row('1 kun',{action:'analytics',start_date:'TODAY',end_date:'TODAY'},{pending:{action:'analytics',fields:{},question:'Qaysi davr?'}}),
 row('Ekran almashtirish, 900 ming',{action:'create',customer:'Bekzod',device:'iPhone 14',price_uzs:900000},{pending:{action:'create',fields:{customer:'Bekzod',device:'iPhone 14'},question:'Qanday ta’mirlash?'}}),
 ...[
 ['Ali','Redmi Note 12',150000,'150 ming'],['Vali','iPhone 12',500000,'yarim million'],['Sardor','Samsung A54',350000,'350000'],['Dilshod','iPhone 13',800000,'800 ming'],['Anvar','Samsung S22',1200000,'1 million 200 ming'],['Javohir','Redmi 10',100000,'yuz ming'],['Otabek','iPhone 11',600000,'olti yuz ming'],['Rustam','Samsung A32',250000,'ikki yuz ellik ming'],['Akmal','Poco X5',300000,'uch yuz ming'],['Shavkat','iPhone 15',2000000,'ikki million'],['Bobur','Samsung A15',180000,'180 ming'],['Jamshid','Redmi Note 13',220000,'220 ming']
 ].map(([name,device,price,spoken])=>row(`${name}dan ${device} oldim, ekranini almashtiramiz ${spoken} so‘m`,{action:'create',device,price_uzs:price})),
 ...[
 ['Ali','Redmi Note 12','tayyor','ready'],['Vali','iPhone 12','topshirildi','delivered'],['Sardor','Samsung A54','ta’mirlash boshlandi','in_progress'],['Dilshod','iPhone 13','bekor qilindi','cancelled'],['Anvar','Samsung S22','tayyor bo‘ldi','ready'],['Javohir','Redmi 10','egasiga berdim','delivered'],['Otabek','iPhone 11','tayyor','ready'],['Rustam','Samsung A32','ta’mirlanmoqda','in_progress'],['Akmal','Poco X5','tayyor','ready'],['Shavkat','iPhone 15','bekor qilindi','cancelled']
 ].map(([name,device,phrase,status])=>row(`${name}ning ${device} buyurtmasi ${phrase}`,{action:'update',device,status})),
 ...['Bu oy nechta buyurtma qabul qildik?','Kecha nechta telefon oldim?','Bugun kelishilgan narxlar jami qancha?','Shu hafta holatlar bo‘yicha hisobot ber','Shu yil nechta ish oldim?','O‘tgan oy qabul qilingan ishlar soni?'].map(text=>row(text,{action:'analytics'})),
 ...['Mening buyurtmalarimni ko‘rsat','Tayyor telefonlar ro‘yxati','Bekzodning buyurtmalarini top','Samsung telefonlar ro‘yxatini ko‘rsat'].map(text=>row(text,{action:'list'})),
 ...['Bugun qancha foyda oldim?','Bekzodning qarzi qancha?','Ekran xarajati 500 mingni yoz','Buyurtmani o‘chirib tashla','Boshqa ustalarning ishlarini ko‘rsat','Ushbu buyurtmani Aziz ustaga o‘tkaz','Telefon ikki soatda tayyor bo‘ldi, tezlik hisobotini ber','Bekzodga 100 ming qaytardim','Rahmat','Salom'].map(text=>row(text,{action:'clarify'}))
];
