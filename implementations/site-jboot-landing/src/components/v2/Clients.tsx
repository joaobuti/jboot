"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import { v2Content } from "@/content/v2-content";

export function Clients() {
  return (
    <section className="py-5" id={v2Content.clients.id}>
      <div className="container">
        <h5 className="fs-20 text-center mb-1">{v2Content.clients.headline}</h5>
        <p className="text-muted text-center small mb-4">{v2Content.clients.description}</p>

        <Swiper
          modules={[Autoplay]}
          autoplay={{ delay: 2000, disableOnInteraction: false }}
          loop
          spaceBetween={20}
          slidesPerView={2}
          breakpoints={{ 576: { slidesPerView: 3 }, 992: { slidesPerView: 5 } }}
        >
          {v2Content.clients.items.map(client => (
            <SwiperSlide key={client.name}>
              <div className="card h-100 border-0 shadow-sm text-center">
                <div className="card-body">
                  <h6 className="fw-semibold mb-1 fs-14">{client.name}</h6>
                  <span className="text-muted text-uppercase fs-11">{client.segment}</span>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
