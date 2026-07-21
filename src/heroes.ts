export type Kingdom = 'flame' | 'ocean' | 'forest' | 'storm';

export interface HeroData {
  id: string;
  name: string;
  kingdom: Kingdom;
  hp: number;
  role: string;
  skillDesc: string;
  skillPhase: string;
  flavorText: string;
}

export const KINGDOM_NAMES: Record<Kingdom, string> = {
  flame: 'Vương Quốc Hỏa',
  ocean: 'Vương Quốc Thủy',
  forest: 'Vương Quốc Mộc',
  storm: 'Vương Quốc Lôi',
};

export const KINGDOM_EMOJI: Record<Kingdom, string> = {
  flame: '🔥',
  ocean: '💧',
  forest: '🌿',
  storm: '⚡',
};

export const ALL_HEROES: HeroData[] = [
  // === Vương Quốc Hỏa (20) ===
  { id: 'ember', name: 'Ember', kingdom: 'flame', hp: 4, role: 'Công', skillPhase: 'action', skillDesc: 'Sau khi bạn gây sát thương bằng lá Đánh, rút 1 lá bài. Hiệu ứng chỉ kích hoạt 1 lần mỗi lượt.', flavorText: 'Tàn lửa cháy âm ỉ, chờ thời cơ bùng lên thành đại hỏa.' },
  { id: 'blaze', name: 'Blaze', kingdom: 'flame', hp: 5, role: 'Đấu sĩ', skillPhase: 'start', skillDesc: 'Lần đầu tiên mỗi lượt bạn nhận sát thương, giảm sát thương đó đi 1 (tối thiểu còn 0).', flavorText: 'Ngọn lửa hừng hực không dễ dàng bị dập tắt.' },
  { id: 'pyro', name: 'Pyro', kingdom: 'flame', hp: 4, role: 'Kết liễu', skillPhase: 'reaction', skillDesc: 'Khi một người chơi bị hạ gục bởi sát thương của bạn, hồi 1 máu và rút 2 lá bài.', flavorText: 'Tro tàn của kẻ thù là minh chứng cho sức mạnh thiêu đốt.' },
  { id: 'inferno', name: 'Inferno', kingdom: 'flame', hp: 4, role: 'Chiến thuật', skillPhase: 'action', skillDesc: 'Sau khi bạn sử dụng lá Lửa, rút 1 lá bài.', flavorText: 'Địa ngục trần gian, thiêu rụi mọi thứ trên đường đi.' },
  { id: 'cinder', name: 'Cinder', kingdom: 'flame', hp: 4, role: 'Báo thù', skillPhase: 'action', skillDesc: 'Sau khi bạn mất máu, lá Đánh đầu tiên bạn sử dụng trước cuối lượt gây thêm 1 sát thương.', flavorText: 'Từ tro tàn, ngọn lửa báo thù bùng cháy dữ dội hơn.' },
  { id: 'magma', name: 'Magma', kingdom: 'flame', hp: 5, role: 'Áp sát', skillPhase: 'start', skillDesc: 'Nếu bạn còn từ 2 máu trở xuống, tầm đánh của bạn +1.', flavorText: 'Dung nham nóng chảy luôn tìm cách tràn đến gần kẻ thù.' },
  { id: 'flare', name: 'Flare', kingdom: 'flame', hp: 3, role: 'Bùng nổ', skillPhase: 'action', skillDesc: 'Lần đầu mỗi lượt bạn gây sát thương bằng thẻ Chiến thuật, rút 1 lá bài.', flavorText: 'Chỉ một tia lửa nhỏ cũng đủ gây ra vụ nổ kinh hoàng.' },
  { id: 'ignis', name: 'Ignis', kingdom: 'flame', hp: 4, role: 'Mở giao tranh', skillPhase: 'action', skillDesc: 'Ngay sau khi bạn lật nhân vật, chọn một người trong tầm đánh gây 1 sát thương.', flavorText: 'Mồi lửa đầu tiên thắp sáng chiến trường.' },
  { id: 'vulcan', name: 'Vulcan', kingdom: 'flame', hp: 5, role: 'Công phá', skillPhase: 'action', skillDesc: 'Lá Đánh đầu tiên bạn sử dụng mỗi lượt không thể bị Đỡ.', flavorText: 'Sức mạnh của thần lửa, không gì có thể ngăn cản.' },
  { id: 'scorch', name: 'Scorch', kingdom: 'flame', hp: 4, role: 'Ép bài', skillPhase: 'action', skillDesc: 'Sau khi bạn gây sát thương, mục tiêu phải bỏ ngẫu nhiên 1 lá bài trên tay. Hiệu ứng tối đa 1 lần mỗi lượt.', flavorText: 'Thiêu đốt không chỉ thể xác, mà cả tài nguyên của đối phương.' },
  { id: 'crimson', name: 'Crimson', kingdom: 'flame', hp: 4, role: 'Áp lực', skillPhase: 'action', skillDesc: 'Sau khi bạn dùng Đánh nhưng không gây sát thương, rút 1 lá bài.', flavorText: 'Màu đỏ thẫm của lửa là màu của áp lực không ngừng.' },
  { id: 'ashen', name: 'Ashen', kingdom: 'flame', hp: 5, role: 'Chống chịu', skillPhase: 'reaction', skillDesc: 'Khi máu của bạn giảm xuống còn đúng 2, hồi ngay 1 máu. Mỗi ván chỉ kích hoạt 1 lần.', flavorText: 'Tro tàn che chở cho ngọn lửa bên trong.' },
  { id: 'phoenix', name: 'Phoenix', kingdom: 'flame', hp: 4, role: 'Sinh tồn', skillPhase: 'reaction', skillDesc: 'Lần đầu tiên trong ván khi bạn vào trạng thái hấp hối, hồi ngay 1 máu. Sau đó kỹ năng mất hiệu lực.', flavorText: 'Từ đống tro tàn, phượng hoàng sống lại.' },
  { id: 'lava', name: 'Lava', kingdom: 'flame', hp: 5, role: 'Càn lướt', skillPhase: 'action', skillDesc: 'Nếu trong lượt của bạn đã gây sát thương ít nhất một lần, khoảng cách từ bạn đến mọi người chơi giảm 1 cho đến hết lượt.', flavorText: 'Dòng dung nham cuộn trào, không gì cản nổi.' },
  { id: 'torch', name: 'Torch', kingdom: 'flame', hp: 4, role: 'Truy kích', skillPhase: 'reaction', skillDesc: 'Sau khi bạn hạ gục một người chơi, được phép sử dụng thêm 1 lá Đánh trong lượt đó.', flavorText: 'Ngọn đuốc không bao giờ tắt cho đến khi kẻ thù cuối cùng gục ngã.' },
  { id: 'burn', name: 'Burn', kingdom: 'flame', hp: 4, role: 'Đốt tài nguyên', skillPhase: 'action', skillDesc: 'Sau khi bạn gây sát thương, có thể chọn phá hủy 1 trang bị của mục tiêu thay vì để mục tiêu bỏ bài.', flavorText: 'Thiêu rụi mọi thứ, kể cả vũ khí và áo giáp.' },
  { id: 'furnace', name: 'Furnace', kingdom: 'flame', hp: 5, role: 'Liều lĩnh', skillPhase: 'start', skillDesc: 'Khi bắt đầu lượt, bạn có thể mất 1 máu. Nếu làm vậy, rút 2 lá bài.', flavorText: 'Lò lửa âm ỉ, sẵn sàng hy sinh để có thêm sức mạnh.' },
  { id: 'solaris', name: 'Solaris', kingdom: 'flame', hp: 4, role: 'Công kích', skillPhase: 'action', skillDesc: 'Trong lượt của bạn, nếu bạn chỉ còn đúng 1 lá bài trên tay, mọi lá Đánh của bạn gây thêm 1 sát thương.', flavorText: 'Sức mạnh mặt trời hội tụ trong một điểm nóng rực.' },
  { id: 'volcano', name: 'Volcano', kingdom: 'flame', hp: 5, role: 'Phản công', skillPhase: 'reaction', skillDesc: 'Sau khi bạn nhận sát thương từ Đánh, có thể ngay lập tức sử dụng 1 lá Đánh lên người vừa gây sát thương nếu họ nằm trong tầm đánh.', flavorText: 'Núi lửa thức giấc, phun trào trả lại những gì đã nhận.' },
  { id: 'hellfire', name: 'Hellfire', kingdom: 'flame', hp: 4, role: 'Chủ lực', skillPhase: 'action', skillDesc: 'Mỗi lượt một lần, khi bạn sử dụng Đánh lên người chơi đang bị thương, lá Đánh đó không tính vào giới hạn 1 lá Đánh mỗi lượt.', flavorText: 'Hỏa ngục giáng thế, thiêu rụi kẻ thù không thương tiếc.' },

  // === Vương Quốc Thủy (20) ===
  { id: 'aqua', name: 'Aqua', kingdom: 'ocean', hp: 4, role: 'Hỗ trợ', skillPhase: 'action', skillDesc: 'Sau khi bạn hồi máu cho một người chơi khác, rút 1 lá bài. Mỗi lượt kích hoạt tối đa 1 lần.', flavorText: 'Dòng nước mát lành mang lại sự sống cho đồng đội.' },
  { id: 'coral', name: 'Coral', kingdom: 'ocean', hp: 5, role: 'Phòng thủ', skillPhase: 'reaction', skillDesc: 'Sau khi bạn nhận sát thương, rút 1 lá bài. Mỗi lượt kích hoạt tối đa 1 lần.', flavorText: 'San hô kiên cố, sóng đánh càng mạnh càng vững vàng.' },
  { id: 'mist', name: 'Mist', kingdom: 'ocean', hp: 4, role: 'Hồi phục', skillPhase: 'start', skillDesc: 'Đầu lượt của bạn, nếu đang bị thương, hồi 1 máu.', flavorText: 'Màn sương dịu dàng chữa lành mọi vết thương.' },
  { id: 'wave', name: 'Wave', kingdom: 'ocean', hp: 4, role: 'Phản công', skillPhase: 'reaction', skillDesc: 'Sau khi bạn dùng Đỡ thành công, rút 1 lá bài.', flavorText: 'Con sóng biết lựa thời cơ để phản công.' },
  { id: 'tide', name: 'Tide', kingdom: 'ocean', hp: 5, role: 'Hồi máu', skillPhase: 'action', skillDesc: 'Lần đầu tiên mỗi lượt bạn hồi máu cho người khác, người đó hồi thêm 1 máu.', flavorText: 'Thủy triều lên mang theo nhựa sống dồi dào.' },
  { id: 'rain', name: 'Rain', kingdom: 'ocean', hp: 4, role: 'Cứu viện', skillPhase: 'reaction', skillDesc: 'Sau khi cứu thành công một người chơi đang hấp hối, rút 2 lá bài.', flavorText: 'Cơn mưa cứu rỗi giữa sa mạc khô cằn.' },
  { id: 'bubble', name: 'Bubble', kingdom: 'ocean', hp: 3, role: 'Né tránh', skillPhase: 'reaction', skillDesc: 'Sau khi bạn dùng Đỡ thành công, khoảng cách từ người khác đến bạn +1 đến đầu lượt kế tiếp của bạn.', flavorText: 'Bong bóng mong manh nhưng khó ai có thể nắm bắt.' },
  { id: 'pearl', name: 'Pearl', kingdom: 'ocean', hp: 4, role: 'Sinh tồn', skillPhase: 'action', skillDesc: 'Ngay sau khi lật nhân vật, hồi 1 máu.', flavorText: 'Viên ngọc trai ẩn mình trong vỏ ốc, chờ thời cơ tỏa sáng.' },
  { id: 'river', name: 'River', kingdom: 'ocean', hp: 5, role: 'Chống khống chế', skillPhase: 'reaction', skillDesc: 'Bạn không thể bị giảm máu tối đa hoặc bị mất kỹ năng bởi thẻ Chiến thuật.', flavorText: 'Dòng sông cứ chảy, không gì có thể ngăn cản dòng chảy tự nhiên.' },
  { id: 'ocean', name: 'Ocean', kingdom: 'ocean', hp: 5, role: 'Kiểm soát', skillPhase: 'end', skillDesc: 'Cuối lượt, nếu bạn không gây sát thương trong lượt này, rút 1 lá bài.', flavorText: 'Đại dương bao la chứa đựng vô vàn bí ẩn.' },
  { id: 'glacier', name: 'Glacier', kingdom: 'ocean', hp: 5, role: 'Chống chịu', skillPhase: 'reaction', skillDesc: 'Lần đầu tiên mỗi lượt bạn nhận sát thương từ Đánh, giảm sát thương đó xuống còn 1 nếu lớn hơn 1.', flavorText: 'Băng hà kiên cố, sức mạnh không thể phá vỡ.' },
  { id: 'spring', name: 'Spring', kingdom: 'ocean', hp: 4, role: 'Hỗ trợ', skillPhase: 'draw', skillDesc: 'Sau khi bạn rút bài ngoài giai đoạn rút bài, có thể cho một người chơi khác rút 1 lá. Mỗi lượt tối đa 1 lần.', flavorText: 'Mạch nước ngầm âm thầm nuôi dưỡng đồng đội.' },
  { id: 'dew', name: 'Dew', kingdom: 'ocean', hp: 4, role: 'Hồi sức', skillPhase: 'reaction', skillDesc: 'Khi máu của bạn giảm xuống còn đúng 2, hồi ngay 1 máu. Mỗi ván chỉ kích hoạt 1 lần.', flavorText: 'Giọt sương mai lấp lánh, hồi sinh giữa bình minh.' },
  { id: 'frost', name: 'Frost', kingdom: 'ocean', hp: 4, role: 'Khống chế', skillPhase: 'action', skillDesc: 'Sau khi bạn gây sát thương bằng Sét, mục tiêu không được dùng Đánh đến hết lượt kế tiếp của họ.', flavorText: 'Sương giá băng lạnh, đóng băng mọi cử động của kẻ thù.' },
  { id: 'whirlpool', name: 'Whirlpool', kingdom: 'ocean', hp: 5, role: 'Kiểm soát khoảng cách', skillPhase: 'reaction', skillDesc: 'Người chơi gây sát thương cho bạn sẽ có khoảng cách đến bạn +1 cho đến hết lượt kế tiếp của họ.', flavorText: 'Vòng xoáy nước cuốn mọi thứ ra xa.' },
  { id: 'harbor', name: 'Harbor', kingdom: 'ocean', hp: 4, role: 'Đồng đội', skillPhase: 'reaction', skillDesc: 'Khi đồng đội (đã nhận ra nhau) trong tầm đánh của bạn nhận sát thương, bạn có thể rút 1 lá bài. Mỗi lượt tối đa 1 lần.', flavorText: 'Bến cảng bình yên, che chở cho đồng đội giữa phong ba.' },
  { id: 'seal', name: 'Seal', kingdom: 'ocean', hp: 4, role: 'Bảo vệ', skillPhase: 'reaction', skillDesc: 'Lần đầu tiên mỗi lượt một trang bị của bạn sắp bị phá hủy, bỏ qua hiệu ứng đó.', flavorText: 'Phong ấn thủy triều, bảo vệ những gì quý giá nhất.' },
  { id: 'monsoon', name: 'Monsoon', kingdom: 'ocean', hp: 5, role: 'Chiến thuật', skillPhase: 'action', skillDesc: 'Sau khi bạn sử dụng một thẻ Chiến thuật không gây sát thương, rút 1 lá bài. Mỗi lượt tối đa 1 lần.', flavorText: 'Gió mùa kéo đến, mang theo cơn mưa chiến thuật bất ngờ.' },
  { id: 'iceberg', name: 'Iceberg', kingdom: 'ocean', hp: 5, role: 'Phản kích', skillPhase: 'reaction', skillDesc: 'Sau khi bạn mất máu, người gây sát thương phải bỏ 1 lá bài trên tay (nếu có).', flavorText: 'Tảng băng trôi vĩ đại, phần nổi chỉ là một góc của sức mạnh.' },
  { id: 'leviathan', name: 'Leviathan', kingdom: 'ocean', hp: 5, role: 'Thủ lĩnh', skillPhase: 'start', skillDesc: 'Đầu lượt của bạn, nếu bạn đang có ít máu nhất bàn, rút thêm 1 lá bài và hồi 1 máu.', flavorText: 'Thủy quái khổng lồ, trỗi dậy từ vực sâu đại dương.' },

  // === Vương Quốc Mộc (20) ===
  { id: 'flora', name: 'Flora', kingdom: 'forest', hp: 4, role: 'Rút bài', skillPhase: 'draw', skillDesc: 'Ở giai đoạn rút bài, bạn rút thêm 1 lá bài.', flavorText: 'Hoa lá sinh sôi, nguồn sống bất tận từ mẹ thiên nhiên.' },
  { id: 'moss', name: 'Moss', kingdom: 'forest', hp: 5, role: 'Trang bị', skillPhase: 'reaction', skillDesc: 'Trang bị của bạn không thể bị phá hủy bởi thẻ Chiến thuật.', flavorText: 'Rêu phong bám chặt, không gì có thể tách rời.' },
  { id: 'bloom', name: 'Bloom', kingdom: 'forest', hp: 4, role: 'Hỗ trợ', skillPhase: 'draw', skillDesc: 'Sau khi bạn rút bài ngoài giai đoạn rút bài, có thể cho một người chơi khác rút 1 lá. Mỗi lượt tối đa 1 lần.', flavorText: 'Hoa nở tỏa hương, chia sẻ nhựa sống cho đồng đội.' },
  { id: 'vine', name: 'Vine', kingdom: 'forest', hp: 4, role: 'Trang bị', skillPhase: 'action', skillDesc: 'Sau khi bạn trang bị một vật phẩm, rút 1 lá bài.', flavorText: 'Dây leo vươn dài, kết nối mọi thứ lại với nhau.' },
  { id: 'root', name: 'Root', kingdom: 'forest', hp: 5, role: 'Tài nguyên', skillPhase: 'reaction', skillDesc: 'Khi một trang bị của bạn rời khỏi khu vực trang bị, rút 2 lá bài.', flavorText: 'Rễ cây ăn sâu vào lòng đất, hút chất dinh dưỡng.' },
  { id: 'fern', name: 'Fern', kingdom: 'forest', hp: 4, role: 'Rút bài', skillPhase: 'action', skillDesc: 'Sau khi sử dụng thẻ Rút, rút thêm 1 lá bài.', flavorText: 'Dương xỉ xoay tròn, mỗi vòng quay là một cơ hội mới.' },
  { id: 'bark', name: 'Bark', kingdom: 'forest', hp: 5, role: 'Phòng thủ', skillPhase: 'end', skillDesc: 'Giới hạn cầm bài cuối lượt của bạn tăng thêm 2.', flavorText: 'Vỏ cây sần sùi, bảo vệ những gì bên trong.' },
  { id: 'seed', name: 'Seed', kingdom: 'forest', hp: 3, role: 'Phục hồi', skillPhase: 'start', skillDesc: 'Nếu đầu lượt bạn có số bài trên tay ít nhất bàn, rút thêm 1 lá.', flavorText: 'Hạt mầm nhỏ bé nhưng chứa đựng cả khu rừng.' },
  { id: 'leaf', name: 'Leaf', kingdom: 'forest', hp: 4, role: 'Quản lý bài', skillPhase: 'end', skillDesc: 'Sau khi bỏ bài ở cuối lượt, rút lại 1 lá bài.', flavorText: 'Lá rụng về cội, luân hồi bất tận.' },
  { id: 'elder', name: 'Elder', kingdom: 'forest', hp: 5, role: 'Trang bị', skillPhase: 'reaction', skillDesc: 'Sau khi có người phá hủy trang bị của bạn, hồi 1 máu.', flavorText: 'Cây cổ thụ già, từng vết thương là từng bài học quý giá.' },
  { id: 'willow', name: 'Willow', kingdom: 'forest', hp: 4, role: 'Điều phối', skillPhase: 'draw', skillDesc: 'Sau khi bạn cho người khác rút bài, bạn cũng rút 1 lá. Mỗi lượt tối đa 1 lần.', flavorText: 'Liễu rủ mềm mại, nhưng cành lá vươn xa.' },
  { id: 'ivy', name: 'Ivy', kingdom: 'forest', hp: 4, role: 'Cướp bài', skillPhase: 'action', skillDesc: 'Sau khi bạn lấy được bài từ người khác bằng hiệu ứng bài hoặc kỹ năng, rút thêm 1 lá.', flavorText: 'Dây thường xuân len lỏi, chiếm lấy từng chút không gian.' },
  { id: 'cedar', name: 'Cedar', kingdom: 'forest', hp: 5, role: 'Bền bỉ', skillPhase: 'end', skillDesc: 'Nếu cuối lượt bạn có từ 6 lá bài trở lên, hồi 1 máu.', flavorText: 'Tuyết tùng cao lớn, vững vàng trước mọi giông bão.' },
  { id: 'clover', name: 'Clover', kingdom: 'forest', hp: 4, role: 'May mắn', skillPhase: 'draw', skillDesc: 'Lần đầu tiên mỗi lượt bạn rút đúng 1 lá bài ngoài giai đoạn rút bài, rút thêm 1 lá.', flavorText: 'Cỏ bốn lá may mắn, mang đến cơ hội bất ngờ.' },
  { id: 'bamboo', name: 'Bamboo', kingdom: 'forest', hp: 5, role: 'Phản ứng', skillPhase: 'reaction', skillDesc: 'Sau khi bạn mất máu, nếu đang có ít hơn 4 lá bài trên tay, rút đến đủ 4 lá.', flavorText: 'Tre uốn cong trước gió nhưng không bao giờ gãy.' },
  { id: 'maple', name: 'Maple', kingdom: 'forest', hp: 4, role: 'Kiểm soát', skillPhase: 'action', skillDesc: 'Sau khi bạn bỏ bài của người khác, có thể xem thêm 1 lá bài trên tay của họ.', flavorText: 'Lá phong đỏ rực, từng chiếc lá rơi đều có thể là một điềm báo.' },
  { id: 'acorn', name: 'Acorn', kingdom: 'forest', hp: 3, role: 'Tăng trưởng', skillPhase: 'start', skillDesc: 'Đầu lượt, nếu bạn không có trang bị, tìm 1 trang bị từ 3 lá trên cùng của bộ bài, lấy 1 lá và đặt các lá còn lại xuống đáy theo thứ tự tùy ý.', flavorText: 'Quả sồi nhỏ mang trong mình tiềm năng của cả khu rừng.' },
  { id: 'oak', name: 'Oak', kingdom: 'forest', hp: 5, role: 'Chống chịu', skillPhase: 'reaction', skillDesc: 'Lần đầu tiên mỗi lượt bạn bị buộc bỏ bài, bỏ ít hơn 1 lá (tối thiểu 0).', flavorText: 'Sồi già vững chãi, không gió bão nào có thể lay chuyển.' },
  { id: 'hazel', name: 'Hazel', kingdom: 'forest', hp: 4, role: 'Hỗ trợ', skillPhase: 'draw', skillDesc: 'Sau khi đồng đội (đã nhận ra nhau) rút bài ngoài giai đoạn rút bài, bạn rút 1 lá. Mỗi lượt tối đa 1 lần.', flavorText: 'Cây phỉ kết nối rễ, chia sẻ dinh dưỡng với đồng loại.' },
  { id: 'ygg', name: 'Ygg', kingdom: 'forest', hp: 5, role: 'Thủ lĩnh', skillPhase: 'start', skillDesc: 'Đầu lượt của bạn, nếu bạn đang có nhiều bài trên tay nhất bàn, hồi 1 máu hoặc rút 1 lá (chọn một).', flavorText: 'Cây thế giới Yggdrasil, kết nối muôn loài và muôn cõi.' },

  // === Vương Quốc Lôi (20) ===
  { id: 'bolt', name: 'Bolt', kingdom: 'storm', hp: 4, role: 'Công kích', skillPhase: 'action', skillDesc: 'Lá Đánh đầu tiên bạn sử dụng mỗi lượt không bị giới hạn bởi tầm đánh.', flavorText: 'Tia chớp xé toang bầu trời, không gì có thể ngăn cản.' },
  { id: 'spark', name: 'Spark', kingdom: 'storm', hp: 3, role: 'Combo', skillPhase: 'action', skillDesc: 'Sau khi bạn sử dụng một thẻ Chiến thuật, rút 1 lá bài. Mỗi lượt tối đa 1 lần.', flavorText: 'Tia lửa điện nhỏ nhưng đủ sức khởi đầu một cơn bão.' },
  { id: 'volt', name: 'Volt', kingdom: 'storm', hp: 4, role: 'Phản công', skillPhase: 'reaction', skillDesc: 'Sau khi bạn dùng Đỡ thành công, có thể lập tức sử dụng 1 lá Đánh.', flavorText: 'Dòng điện phản hồi, đánh trả lại kẻ tấn công.' },
  { id: 'flash', name: 'Flash', kingdom: 'storm', hp: 4, role: 'Cơ động', skillPhase: 'action', skillDesc: 'Nếu bạn không có Vũ khí, tầm đánh của bạn +1.', flavorText: 'Ánh chớp lóe sáng, di chuyển với tốc độ không thể theo kịp.' },
  { id: 'storm', name: 'Storm', kingdom: 'storm', hp: 5, role: 'Di chuyển', skillPhase: 'action', skillDesc: 'Sau khi bạn gây sát thương, có thể đổi vị trí ngồi với một người chơi liền kề bạn.', flavorText: 'Cơn bão cuốn phăng mọi thứ, xáo trộn trật tự chiến trường.' },
  { id: 'thunder', name: 'Thunder', kingdom: 'storm', hp: 4, role: 'Sét', skillPhase: 'action', skillDesc: 'Sau khi bạn dùng Sét gây sát thương, rút 1 lá bài.', flavorText: 'Sấm sét vang rền, uy lực của thiên nhiên giáng thế.' },
  { id: 'wind', name: 'Wind', kingdom: 'storm', hp: 4, role: 'Khoảng cách', skillPhase: 'start', skillDesc: 'Khoảng cách từ bạn đến tất cả người chơi khác giảm 1.', flavorText: 'Gió nhẹ len lỏi qua mọi kẽ hở, xóa nhòa khoảng cách.' },
  { id: 'echo', name: 'Echo', kingdom: 'storm', hp: 3, role: 'Kiểm soát', skillPhase: 'action', skillDesc: 'Sau khi bạn sử dụng Đổi hoặc Cướp, rút 1 lá bài.', flavorText: 'Tiếng vọng của sấm rền, lặp lại và khuếch đại sức mạnh.' },
  { id: 'sonic', name: 'Sonic', kingdom: 'storm', hp: 4, role: 'Khởi đầu', skillPhase: 'action', skillDesc: 'Ngay sau khi bạn lật nhân vật, rút 2 lá bài.', flavorText: 'Sóng âm vỡ òa, mở màn cho cuộc chiến.' },
  { id: 'tempest', name: 'Tempest', kingdom: 'storm', hp: 5, role: 'Áp lực', skillPhase: 'action', skillDesc: 'Sau khi bạn sử dụng lá Đánh đầu tiên mỗi lượt, xem ngẫu nhiên 1 lá bài trên tay mục tiêu.', flavorText: 'Bão tố nổi lên, phơi bày mọi bí mật của kẻ thù.' },
  { id: 'cyclone', name: 'Cyclone', kingdom: 'storm', hp: 4, role: 'Tốc độ', skillPhase: 'action', skillDesc: 'Sau khi bạn dùng Đánh nhưng không gây sát thương, rút 1 lá bài.', flavorText: 'Lốc xoáy cuộn trào, mỗi lần xoay là một cơ hội mới.' },
  { id: 'gust', name: 'Gust', kingdom: 'storm', hp: 4, role: 'Tầm đánh', skillPhase: 'action', skillDesc: 'Trong lượt của bạn, mỗi khi khoảng cách đến mục tiêu giảm xuống còn 1, lá Đánh kế tiếp của bạn gây thêm 1 sát thương.', flavorText: 'Cơn gió mạnh đẩy mọi thứ đến gần hơn.' },
  { id: 'nimbus', name: 'Nimbus', kingdom: 'storm', hp: 5, role: 'Hỗ trợ', skillPhase: 'start', skillDesc: 'Đầu lượt của bạn, chọn một người chơi. Khoảng cách giữa bạn và người đó trở thành 1 cho đến hết lượt.', flavorText: 'Mây đen kéo đến, phủ bóng xuống kẻ thù.' },
  { id: 'static', name: 'Static', kingdom: 'storm', hp: 4, role: 'Khóa', skillPhase: 'action', skillDesc: 'Sau khi bạn gây sát thương bằng Đánh, mục tiêu không được dùng kỹ năng đến hết lượt kế tiếp của họ.', flavorText: 'Tĩnh điện tích tụ, đóng băng mọi kỹ năng của đối thủ.' },
  { id: 'pulse', name: 'Pulse', kingdom: 'storm', hp: 4, role: 'Combo', skillPhase: 'draw', skillDesc: 'Lần đầu tiên mỗi lượt bạn rút bài ngoài giai đoạn rút bài, có thể sử dụng thêm 1 lá Đánh trong lượt này.', flavorText: 'Xung điện lan tỏa, mở rộng khả năng chiến đấu.' },
  { id: 'raijin', name: 'Raijin', kingdom: 'storm', hp: 5, role: 'Chủ lực', skillPhase: 'action', skillDesc: 'Nếu trong lượt của bạn đã gây sát thương ít nhất một lần, mọi thẻ Chiến thuật gây sát thương bạn sử dụng trong lượt đó gây thêm 1 sát thương.', flavorText: 'Sấm sét quỷ thần, oai linh lẫm liệt trên chiến trường.' },
  { id: 'zephyr', name: 'Zephyr', kingdom: 'storm', hp: 4, role: 'Né tránh', skillPhase: 'reaction', skillDesc: 'Lần đầu tiên mỗi lượt bạn trở thành mục tiêu của Đánh, khoảng cách từ người đó đến bạn +1 trước khi kiểm tra tầm đánh. Nếu mục tiêu không còn trong tầm, lá Đánh bị hủy.', flavorText: 'Ngọn gió tây nhẹ nhàng nhưng không ai có thể chạm tới.' },
  { id: 'arc', name: 'Arc', kingdom: 'storm', hp: 4, role: 'Kiểm soát', skillPhase: 'action', skillDesc: 'Sau khi bạn dùng Cuốn Bay phá hủy trang bị của người khác, rút 1 lá bài.', flavorText: 'Hồ quang điện lóe sáng, cắt đứt mọi kết nối.' },
  { id: 'orion', name: 'Orion', kingdom: 'storm', hp: 5, role: 'Áp sát', skillPhase: 'start', skillDesc: 'Đầu lượt của bạn, nếu không có người chơi nào trong tầm đánh, tầm đánh của bạn +2 cho đến hết lượt.', flavorText: 'Chòm sao Orion dẫn đường cho những đòn tấn công chính xác.' },
  { id: 'ragnarok', name: 'Ragnarok', kingdom: 'storm', hp: 5, role: 'Thủ lĩnh', skillPhase: 'reaction', skillDesc: 'Mỗi lượt một lần, sau khi bạn hạ gục một người chơi, ngay lập tức thực hiện thêm một giai đoạn Hành động (không rút bài và không kết thúc lượt).', flavorText: 'Ngày tận thế, kết thúc mọi cuộc chiến.' },
];

export const HERO_MAP: Record<string, HeroData> = {};
ALL_HEROES.forEach(h => { HERO_MAP[h.name] = h; HERO_MAP[h.id] = h; });

export function getHeroByName(name: string): HeroData | undefined {
  return HERO_MAP[name];
}

export function getHeroesByKingdom(kingdom: Kingdom): HeroData[] {
  return ALL_HEROES.filter(h => h.kingdom === kingdom);
}
